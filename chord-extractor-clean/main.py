import os
import subprocess
import re
import math
import statistics
import time
import threading
from pathlib import Path

# Import our scripts
from process_chords import process_chord_items, process_sonic_annotator_csv, delete_temp_file

# For chord extraction
import vamp
import soundfile as sf

# Get the directory where this script is located
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Paths relative to app directory
TEMP_DIR = os.path.join(APP_DIR, "temp")
OUTPUT_DIR = os.path.join(APP_DIR, "output")

# Sonic-annotator paths (relative to app directory)
SONIC_ANNOTATOR_BIN = os.path.join(APP_DIR, "sonic-annotator", "sonic-annotator")
SONIC_ANNOTATOR_LIB = os.path.join(APP_DIR, "sonic-annotator")
VAMP_PATH = os.path.join(APP_DIR, "vamp_plugins")
SONIC_ANNOTATOR_VERBOSE = os.environ.get("SONIC_ANNOTATOR_VERBOSE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
REGULAR_ENGINE = os.environ.get("YOUCHORDS_REGULAR_ENGINE", "chordino").strip().lower()
LAST_PROCESS_TIMINGS = {}
_MADMOM_PROCESSOR_LOCK = threading.Lock()
_MADMOM_COMPAT_PATCHED = False
_MADMOM_DEEP_CHROMA_PROCESSOR = None
_MADMOM_CHORD_RECOGNITION_PROCESSOR = None
_MADMOM_ROOT_RE = re.compile(r"^([A-G](?:#|b)?)(.*)$")
_MADMOM_FLAT_TO_SHARP = {
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#",
}


def _round_seconds(value):
    try:
        return round(float(value), 3)
    except Exception:
        return 0.0


def _set_last_process_timings(timings):
    global LAST_PROCESS_TIMINGS
    LAST_PROCESS_TIMINGS = dict(timings or {})


def get_last_process_timings():
    return dict(LAST_PROCESS_TIMINGS)


def _print_process_timings(timings):
    if not timings:
        return
    print(
        "[ChordTiming] "
        f"wav_load_s={timings.get('wavLoadSeconds', 0):.3f} "
        f"tuning_s={timings.get('tuningSeconds', 0):.3f} "
        f"madmom_regular_s={timings.get('madmomRegularSeconds', 0):.3f} "
        f"regular_harmonic_s={timings.get('regularHarmonicSeconds', 0):.3f} "
        f"harmonic_plus_s={timings.get('harmonicPlusSeconds', 0):.3f} "
        f"save_json_s={timings.get('saveJsonSeconds', 0):.3f} "
        f"analysis_total_s={timings.get('analysisTotalSeconds', 0):.3f}"
    )


def extract_video_id(file_path):
    """Extract video ID from a file path."""
    file_name = os.path.basename(file_path)
    match = re.search(r'[\w-]{11}', file_name)
    if match:
        return match.group(0)
    return Path(file_path).stem


_FLOAT_PATTERN = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def _parse_float(value):
    """Best-effort numeric parser for plugin outputs."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = _FLOAT_PATTERN.search(value)
        if match:
            try:
                return float(match.group(0))
            except ValueError:
                return None
    return None


def _extract_tuning_candidates(tuning_data):
    """
    Extract tuning frequencies (Hz) from possible VAMP output shapes.
    Accept only musically-plausible A4 range to avoid garbage values.
    """
    candidates = []

    def add_candidate(raw_value):
        numeric = _parse_float(raw_value)
        if numeric is None:
            return
        if 380.0 <= numeric <= 500.0:
            candidates.append(float(numeric))

    def process_item(item):
        if isinstance(item, dict):
            for key in ("value", "label", "frequency", "freq", "tuning"):
                if key in item:
                    add_candidate(item[key])

            values = item.get("values")
            if isinstance(values, (list, tuple)):
                for v in values[:3]:
                    add_candidate(v)
        elif isinstance(item, (list, tuple)):
            for sub in item:
                process_item(sub)
        else:
            add_candidate(item)

    process_item(tuning_data)

    if isinstance(tuning_data, dict):
        for key in ("list", "vector", "matrix", "data"):
            seq = tuning_data.get(key)
            if isinstance(seq, (list, tuple)):
                for entry in seq:
                    process_item(entry)

    return candidates


def estimate_tuning_with_vamp(data, rate):
    """
    Estimate global A4 tuning (Hz) with VAMP NNLS-Chroma tuning plugin.
    Returns (semitones_from_440, tuning_hz).
    """
    tuning_output = vamp.collect(
        data,
        rate,
        "nnls-chroma:tuning",
        output="tuning",
    )
    candidates = _extract_tuning_candidates(tuning_output)
    if not candidates:
        raise RuntimeError(f"VAMP tuning returned no valid frequency candidates: {tuning_output}")

    tuning_freq = float(statistics.median(candidates))
    tuning_semitones = 12.0 * math.log2(tuning_freq / 440.0)
    return tuning_semitones, tuning_freq


def _is_sonic_progress_line(line):
    value = str(line or "").strip().lower()
    if not value:
        return True
    if value.startswith("decoding ") and ("... " in value or value.endswith("%")):
        return True
    if value.startswith("extracting and writing features..."):
        return True
    return False


def _print_sonic_logs(stdout_text, stderr_text, force=False):
    if not force and not SONIC_ANNOTATOR_VERBOSE:
        return

    lines = []
    for block in (stdout_text, stderr_text):
        if not block:
            continue
        for raw_line in str(block).splitlines():
            line = raw_line.strip()
            if not line or _is_sonic_progress_line(line):
                continue
            lines.append(line)

    if not lines:
        return

    tail_lines = lines[-60:]
    for line in tail_lines:
        print(line)


def extract_regular_harmonic(wav_file):
    """
    Extract REGULAR and HARMONIC chord text using sonic-annotator in a single run.
    """
    try:
        print("Extracting REGULAR and HARMONIC chords...")
        
        if not os.path.exists(wav_file):
            print(f"Error: WAV file does not exist: {wav_file}")
            return None, None
        
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = SONIC_ANNOTATOR_LIB
        env["VAMP_PATH"] = VAMP_PATH
        
        wav_filename = os.path.basename(wav_file).replace('.wav', '')
        
        cmd = [
            SONIC_ANNOTATOR_BIN,
            "-d", "vamp:nnls-chroma:chordino:simplechord",
            "-d", "vamp:nnls-chroma:chordino:chordnotes",
            "-w", "csv",
            "--csv-force",
            "--csv-basedir", TEMP_DIR,
            wav_file
        ]

        result = subprocess.run(
            cmd,
            check=False,
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            _print_sonic_logs(result.stdout, result.stderr, force=True)
            raise RuntimeError(f"sonic-annotator failed with exit code {result.returncode}")

        _print_sonic_logs(result.stdout, result.stderr, force=False)
        
        # Process REGULAR-reference chords (simplechord - used as initial MAJ7 signal source)
        regular_csv = os.path.join(TEMP_DIR, f"{wav_filename}_vamp_nnls-chroma_chordino_simplechord.csv")
        regular_chord_text = None
        regular_reference_chord_text = None
        if os.path.exists(regular_csv) and os.path.getsize(regular_csv) > 0:
            # Keep CSV for second pass so displayed HARMONIC can be aligned to displayed REGULAR.
            regular_reference_chord_text = process_sonic_annotator_csv(
                regular_csv,
                output_suffix="_chords_beginner.txt",
                delete_source=False,
                return_text=True,
            )
            regular_chord_text = regular_reference_chord_text
        
        # Process HARMONIC chords (chordnotes - gives MIDI notes, converted to simple chord names)
        # Pass initial REGULAR-reference so we can keep real MAJ7 where needed
        harmonic_csv = os.path.join(TEMP_DIR, f"{wav_filename}_vamp_nnls-chroma_chordino_chordnotes.csv")
        harmonic_chord_text = None
        if os.path.exists(harmonic_csv) and os.path.getsize(harmonic_csv) > 0:
            harmonic_chord_text = process_sonic_annotator_csv(
                harmonic_csv,
                output_suffix="_chords_advance2.txt",
                regular_chords_file=regular_reference_chord_text,
                return_text=True,
            )

        # Rebuild displayed HARMONIC using displayed REGULAR as the MAJ7 source of truth.
        if (
            harmonic_chord_text
            and os.path.exists(regular_csv)
            and os.path.getsize(regular_csv) > 0
        ):
            aligned_harmonic_text = process_sonic_annotator_csv(
                regular_csv,
                output_suffix="_chords_beginner.txt",
                regular_chords_file=harmonic_chord_text,
                return_text=True,
            )
            if aligned_harmonic_text:
                regular_chord_text = aligned_harmonic_text
        else:
            # No second pass happened, so clean the kept CSV from first pass.
            delete_temp_file(regular_csv)

        return harmonic_chord_text, regular_chord_text
        
    except Exception as e:
        print(f"Error in REGULAR/HARMONIC extraction: {e}")
        return None, None


def _format_madmom_label(label):
    value = str(label or "N").strip().strip('"')
    if not value or value == "N":
        return "N"

    value = value.replace(":maj", "")
    value = value.replace(":min", "m")
    value = value.replace(":dim", "dim")
    value = value.replace(":aug", "aug")

    match = _MADMOM_ROOT_RE.match(value)
    if not match:
        return value

    root = _MADMOM_FLAT_TO_SHARP.get(match.group(1), match.group(1))
    return f"{root}{match.group(2)}"


def _format_chord_time(value):
    text = f"{max(0.0, float(value)):.3f}".rstrip("0").rstrip(".")
    return text or "0"


def _madmom_rows_to_chord_text(rows):
    entries = []
    last_label = None
    if rows is None:
        return ""

    for row in rows:
        try:
            start = float(row["start"])
            label = row["label"]
        except Exception:
            continue

        label = _format_madmom_label(label)
        if label == "N" or label == last_label:
            continue

        entries.append(f"{_format_chord_time(start)}:{label}")
        last_label = label

    return ",".join(entries)


def _patch_madmom_compat():
    global _MADMOM_COMPAT_PATCHED
    if _MADMOM_COMPAT_PATCHED:
        return

    import collections
    import collections.abc
    import numpy as np

    # madmom 0.16.1 still references old collections and numpy aliases.
    for name in (
        "Callable",
        "Iterable",
        "Mapping",
        "MutableMapping",
        "MutableSequence",
        "MutableSet",
        "Sequence",
        "Set",
    ):
        if not hasattr(collections, name):
            setattr(collections, name, getattr(collections.abc, name))

    for name, value in {
        "bool": bool,
        "complex": complex,
        "float": float,
        "int": int,
    }.items():
        if name not in np.__dict__:
            setattr(np, name, value)

    _MADMOM_COMPAT_PATCHED = True


def _madmom_processors_ready():
    return _MADMOM_DEEP_CHROMA_PROCESSOR is not None and _MADMOM_CHORD_RECOGNITION_PROCESSOR is not None


def _get_madmom_regular_processors():
    global _MADMOM_DEEP_CHROMA_PROCESSOR, _MADMOM_CHORD_RECOGNITION_PROCESSOR

    if _madmom_processors_ready():
        return _MADMOM_DEEP_CHROMA_PROCESSOR, _MADMOM_CHORD_RECOGNITION_PROCESSOR

    with _MADMOM_PROCESSOR_LOCK:
        if _madmom_processors_ready():
            return _MADMOM_DEEP_CHROMA_PROCESSOR, _MADMOM_CHORD_RECOGNITION_PROCESSOR

        _patch_madmom_compat()

        from madmom.audio.chroma import DeepChromaProcessor
        from madmom.features.chords import DeepChromaChordRecognitionProcessor

        _MADMOM_DEEP_CHROMA_PROCESSOR = DeepChromaProcessor()
        _MADMOM_CHORD_RECOGNITION_PROCESSOR = DeepChromaChordRecognitionProcessor()
        return _MADMOM_DEEP_CHROMA_PROCESSOR, _MADMOM_CHORD_RECOGNITION_PROCESSOR


def warm_madmom_regular_processor():
    if REGULAR_ENGINE != "madmom":
        return False

    started_at = time.perf_counter()
    already_ready = _madmom_processors_ready()
    try:
        _get_madmom_regular_processors()
        print(
            "[MadmomWarmupTiming] "
            f"ok=true reused={str(already_ready).lower()} "
            f"seconds={_round_seconds(time.perf_counter() - started_at):.3f}"
        )
        return True
    except Exception as e:
        print(
            "[MadmomWarmupTiming] "
            f"ok=false seconds={_round_seconds(time.perf_counter() - started_at):.3f} "
            f"error={e}"
        )
        return False


def extract_madmom_regular(wav_file):
    """
    Extract the primary Regular mode using Madmom DeepChroma.
    Imports stay inside the function so production images without madmom keep working.
    """
    try:
        deep_chroma_processor, chord_processor = _get_madmom_regular_processors()

        print("Extracting REGULAR with Madmom DeepChroma...")
        deep_chroma = deep_chroma_processor(str(wav_file))
        raw_rows = chord_processor(deep_chroma)
        chord_text = _madmom_rows_to_chord_text(raw_rows)
        print(f"Madmom REGULAR chords: {len(chord_text.split(',')) if chord_text else 0} changes")
        return chord_text or None
    except Exception as e:
        print(f"Madmom REGULAR error: {e}")
        return None


def process_wav_file(wav_file):
    """
    Process a WAV file sequentially.
    Loads the WAV file once and reuses the data for Tuning and Harmonic+.
    
    Order: Tuning → optional Madmom Regular → Chordino Regular+/Harmonic → Harmonic+ → Compress
    """
    total_started_at = time.perf_counter()
    timings = {}

    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    video_id = extract_video_id(wav_file)
    wav_filename = os.path.basename(wav_file).replace('.wav', '')
    
    # Load WAV file ONCE
    print(f"Loading WAV file: {wav_file}")
    os.environ["VAMP_PATH"] = VAMP_PATH
    load_started_at = time.perf_counter()
    data, rate = sf.read(wav_file, dtype='float32', always_2d=False)
    # Convert stereo to mono if needed (vamp expects 1D array)
    if len(data.shape) > 1:
        data = data.mean(axis=1, dtype='float32')
    timings["wavLoadSeconds"] = _round_seconds(time.perf_counter() - load_started_at)
    print(f"WAV loaded: {len(data)} samples, {rate}Hz")
    
    # 1. TUNING detection using VAMP NNLS-Chroma tuning plugin
    print("\n[1/5] Extracting TUNING...")
    tuning_started_at = time.perf_counter()
    tuning_value = "440.00"
    try:
        # Reuse already-loaded mono waveform to avoid loading WAV twice.
        tuning_semitones, tuning_freq = estimate_tuning_with_vamp(data, rate)
        tuning_value = f"{tuning_freq:.2f}"
        print(f"Tuning: {tuning_freq:.2f}Hz (deviation: {tuning_semitones:.3f} semitones)")
    except Exception as e:
        # No librosa fallback by design; keep deterministic default.
        tuning_freq = 440.0
        tuning_value = f"{tuning_freq:.2f}"
        print(f"Tuning error (VAMP): {e}")
        print("Tuning fallback value used: 440.00Hz")
    timings["tuningSeconds"] = _round_seconds(time.perf_counter() - tuning_started_at)
    
    # 2. Optional MADMOM REGULAR (primary R in staging)
    print("\n[2/5] Extracting PRIMARY REGULAR...")
    madmom_started_at = time.perf_counter()
    madmom_regular_text = None
    regular_engine_version = "chordino-v1"
    if REGULAR_ENGINE == "madmom":
        madmom_regular_text = extract_madmom_regular(wav_file)
        if madmom_regular_text:
            regular_engine_version = "madmom-deepchroma-v1"
    else:
        print(f"Primary REGULAR engine: Chordino (YOUCHORDS_REGULAR_ENGINE={REGULAR_ENGINE or 'chordino'})")
    timings["madmomRegularSeconds"] = _round_seconds(time.perf_counter() - madmom_started_at)

    # 3. REGULAR+ + HARMONIC (sonic-annotator)
    print("\n[3/5] Extracting REGULAR+ + HARMONIC...")
    regular_harmonic_started_at = time.perf_counter()
    harmonic_chord_file, regular_chord_file = extract_regular_harmonic(wav_file)
    timings["regularHarmonicSeconds"] = _round_seconds(time.perf_counter() - regular_harmonic_started_at)
    
    # 4. HARMONIC+ (using pre-loaded data)
    print("\n[4/5] Extracting HARMONIC+...")
    harmonicplus_started_at = time.perf_counter()
    harmonicplus_chord_text = None
    try:
        params = {
            'useNNLS': 1,
            'rollon': 1.0,
            's': 0.7,
            'boostn': 0.1,
            'whitening': 0.7
        }
        step_size = int(rate * 0.2)
        block_size = 16384
        
        chords = vamp.collect(
            data, rate, 'nnls-chroma:chordino',
            output='simplechord',
            step_size=step_size,
            block_size=block_size,
            parameters=params
        )

        chord_items = [
            {
                "timestamp": float(chord_item['timestamp']),
                "chord": chord_item['label'],
            }
            for chord_item in chords.get('list', [])
        ]
        harmonicplus_count = len(chord_items)

        # Release the larger raw VAMP structure as soon as possible.
        del chords
        
        # Keep Harmonic+ MAJ7 behavior aligned with displayed REGULAR mode.
        harmonicplus_reference_text = harmonic_chord_file or regular_chord_file
        harmonicplus_chord_text = process_chord_items(
            chord_items,
            is_advanced=True,
            regular_chords_file=harmonicplus_reference_text,
            return_text=True,
        )
        print(f"HARMONIC+ chords: {harmonicplus_count} changes")
    except Exception as e:
        print(f"HARMONIC+ error: {e}")
    timings["harmonicPlusSeconds"] = _round_seconds(time.perf_counter() - harmonicplus_started_at)
    
    # 5. Save as JSON.GZ
    print("\n[5/5] Saving to JSON.GZ...")
    
    primary_regular_text = madmom_regular_text or harmonic_chord_file
    regularplus_chord_text = harmonic_chord_file
    if not madmom_regular_text and REGULAR_ENGINE == "madmom":
        regular_engine_version = "chordino-fallback-v1"

    if harmonicplus_chord_text or harmonic_chord_file or regular_chord_file or tuning_value:
        try:
            from compress_files import save_chords_json
            save_started_at = time.perf_counter()
            output_file = save_chords_json(
                video_id,
                primary_regular_text,
                regular_chord_file,
                harmonicplus_chord_text,
                tuning_value,
                regularplus_file=regularplus_chord_text,
                chord_engine_version=regular_engine_version,
            )
            timings["saveJsonWrapperSeconds"] = _round_seconds(time.perf_counter() - save_started_at)
            try:
                from compress_files import get_last_compress_timings
                timings.update(get_last_compress_timings())
            except Exception:
                pass
            timings["analysisTotalSeconds"] = _round_seconds(time.perf_counter() - total_started_at)
            _set_last_process_timings(timings)
            _print_process_timings(timings)
            print(f"Done! Created: {output_file}")
            return True
        except Exception as e:
            timings["analysisTotalSeconds"] = _round_seconds(time.perf_counter() - total_started_at)
            _set_last_process_timings(timings)
            _print_process_timings(timings)
            print(f"Save error: {e}")
            return False
    else:
        timings["analysisTotalSeconds"] = _round_seconds(time.perf_counter() - total_started_at)
        _set_last_process_timings(timings)
        _print_process_timings(timings)
        print("No output files to save.")
        return False


def main():
    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("This function is deprecated. Please use router.py instead.")
    print("Example: python router.py --url \"YOUR_URL\"")


if __name__ == "__main__":
    main()
