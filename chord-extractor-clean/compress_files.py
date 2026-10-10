import os
import json
import gzip
import time

# Get the directory where this script is located
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Paths relative to app directory
OUTPUT_DIR = os.path.join(APP_DIR, "output")
CHORDS_DIR = os.path.join(OUTPUT_DIR, "chords")
LYRICS_DIR = os.path.join(OUTPUT_DIR, "lyrics")

# Ensure directories exist
os.makedirs(CHORDS_DIR, exist_ok=True)
os.makedirs(LYRICS_DIR, exist_ok=True)
LAST_COMPRESS_TIMINGS = {}
PACKED_CHORD_SCALE = 1000


def _round_seconds(value):
    try:
        return round(float(value), 3)
    except Exception:
        return 0.0


def _set_last_compress_timings(timings):
    global LAST_COMPRESS_TIMINGS
    LAST_COMPRESS_TIMINGS = dict(timings or {})


def get_last_compress_timings():
    return dict(LAST_COMPRESS_TIMINGS)


def _read_text_source(source, default=""):
    if not source:
        return default

    source_path = os.fspath(source) if isinstance(source, os.PathLike) else str(source)
    if os.path.exists(source_path):
        with open(source_path, 'r', encoding='utf-8') as f:
            return f.read().strip()

    return source_path.strip()


def _delete_if_path(source):
    if not source:
        return

    source_path = os.fspath(source) if isinstance(source, os.PathLike) else str(source)
    if os.path.exists(source_path):
        os.remove(source_path)
        print(f"Deleted: {source_path}")


def _extract_unique_chords_for_metrics(*texts):
    chords = set()
    for text in texts:
        if not text:
            continue
        for entry in str(text).split(","):
            if ":" not in entry:
                continue
            chord_name = entry.split(":", 1)[1].strip()
            if chord_name and chord_name != "N":
                chords.add(chord_name)
    return chords


def _parse_chord_timeline(text):
    entries = []
    if not text:
        return entries

    for entry in str(text).split(","):
        if ":" not in entry:
            continue

        time_text, chord_name = entry.split(":", 1)
        chord_name = chord_name.strip()
        if not chord_name:
            continue

        try:
            time_units = int(round(float(time_text.strip()) * PACKED_CHORD_SCALE))
        except Exception:
            continue

        entries.append((time_units, chord_name))

    return entries


def _encode_packed_timeline(entries, chord_index):
    parts = []
    last_time = 0

    for time_units, chord_name in entries:
        if chord_name not in chord_index:
            continue

        delta = time_units - last_time
        last_time = time_units
        parts.append(f"{delta}.{chord_index[chord_name]}")

    return ",".join(parts)


def _pack_chord_timelines(all_data):
    timelines = {
        "r": _parse_chord_timeline(all_data.get("regular", "")),
        "rp": _parse_chord_timeline(all_data.get("regularPlus", "")),
        "h": _parse_chord_timeline(all_data.get("harmonic", "")),
        "p": _parse_chord_timeline(all_data.get("harmonicPlus", "")),
    }
    chord_names = sorted(
        {
            chord_name
            for entries in timelines.values()
            for _, chord_name in entries
        }
    )
    chord_index = {chord_name: index for index, chord_name in enumerate(chord_names)}

    return {
        "v": 2,
        "s": PACKED_CHORD_SCALE,
        "c": chord_names,
        "r": _encode_packed_timeline(timelines["r"], chord_index),
        "rp": _encode_packed_timeline(timelines["rp"], chord_index),
        "h": _encode_packed_timeline(timelines["h"], chord_index),
        "p": _encode_packed_timeline(timelines["p"], chord_index),
        "t": all_data.get("tuning", "440.00"),
        "n": 1 if all_data.get("hasNonStandardTuning") else 0,
        "e": all_data.get("chordEngineVersion") or "chordino-v1",
    }


def save_chords_json(
    video_id,
    regular_file,
    harmonic_file,
    harmonicplus_file,
    tuning_file,
    regularplus_file=None,
    chord_engine_version=None,
):
    """
    Save chord files as ONE JSON.GZ file with ALL chord data:
    - chords/VIDEO_ID.json.gz: chord timelines only (regular, harmonic, harmonicPlus, tuning)
      Capo transpositions and chord positions are generated client-side and cached in IndexedDB.
    
    Args:
        video_id: YouTube video ID
        regular_file: Path to primary regular chords file or raw chord text
        regularplus_file: Path to classic regular/chordino chords file or raw chord text
        harmonic_file: Path to harmonic chords file or raw chord text
        harmonicplus_file: Path to harmonic+ chords file or raw chord text
        tuning_file: Path to tuning file or raw tuning value
        
    Returns:
        str: output_file_path
    """
    save_started_at = time.perf_counter()
    read_started_at = time.perf_counter()

    # ========== Read tuning first ==========
    tuning_value = _read_text_source(tuning_file, default="440.00")
    
    # Check if tuning is non-standard (outside 434-446 Hz range)
    has_non_standard_tuning = False
    try:
        tuning_hz = float(tuning_value)
        if abs(tuning_hz - 440) > 6:  # Outside 434-446 Hz
            has_non_standard_tuning = True
            print(f"🎸 Non-standard tuning detected: {tuning_hz} Hz")
    except ValueError:
        pass
    
    # ========== ONE FILE WITH ALL DATA ==========
    all_data = {}
    
    # Read primary regular chords.
    all_data['regular'] = _read_text_source(regular_file)

    # Read classic regular/chordino chords as Regular+.
    all_data['regularPlus'] = _read_text_source(regularplus_file, default=all_data['regular'])
    
    # Read harmonic chords (from simplechord - complex chords like C#7, Dmaj7)
    all_data['harmonic'] = _read_text_source(harmonic_file)
    
    # Read harmonic+ chords
    all_data['harmonicPlus'] = _read_text_source(harmonicplus_file)
    
    # Add tuning value
    all_data['tuning'] = tuning_value
    all_data['hasNonStandardTuning'] = has_non_standard_tuning
    all_data['chordEngineVersion'] = chord_engine_version or "chordino-v1"
    read_seconds = time.perf_counter() - read_started_at

    all_chord_names = _extract_unique_chords_for_metrics(
        all_data.get('regular', ''),
        all_data.get('regularPlus', ''),
        all_data.get('harmonic', ''),
        all_data.get('harmonicPlus', '')
    )
    capo_seconds = 0.0
    positions_seconds = 0.0
    positions_count = 0
    print(
        "Skipping server capo transpositions and chord positions; "
        f"client will generate them for {len(all_chord_names)} unique chords."
    )
    
    packed_data = _pack_chord_timelines(all_data)

    # Save ONE compact file with chord timelines
    output_file = os.path.join(CHORDS_DIR, f"{video_id}.json.gz")
    gzip_started_at = time.perf_counter()
    with gzip.open(output_file, 'wt', encoding='utf-8') as f:
        json.dump(packed_data, f, separators=(',', ':'))
    gzip_seconds = time.perf_counter() - gzip_started_at
    print(f"All chords saved to: {output_file}")
    
    # Delete original files
    for file_path in [regular_file, regularplus_file, harmonic_file, harmonicplus_file, tuning_file]:
        _delete_if_path(file_path)

    timings = {
        "jsonReadSeconds": _round_seconds(read_seconds),
        "capoSeconds": _round_seconds(capo_seconds),
        "positionsSeconds": _round_seconds(positions_seconds),
        "gzipWriteSeconds": _round_seconds(gzip_seconds),
        "saveJsonSeconds": _round_seconds(time.perf_counter() - save_started_at),
        "uniqueChordNames": len(all_chord_names),
        "positionsFound": positions_count,
    }
    _set_last_compress_timings(timings)
    print(
        "[SaveTiming] "
        f"read_s={timings['jsonReadSeconds']:.3f} "
        f"capo_s={timings['capoSeconds']:.3f} "
        f"positions_s={timings['positionsSeconds']:.3f} "
        f"gzip_s={timings['gzipWriteSeconds']:.3f} "
        f"save_s={timings['saveJsonSeconds']:.3f} "
        f"unique_chords={timings['uniqueChordNames']} positions_found={timings['positionsFound']}"
    )
    
    return output_file



def save_lyrics_json(video_id, sentence_file, word_file):
    """
    Save lyrics files as a single JSON.GZ file.
    
    Args:
        video_id: YouTube video ID
        sentence_file: Path to sentence-level SRT file
        word_file: Path to word-level SRT file
        
    Returns:
        str: Path to the created JSON.GZ file
    """
    data = {}
    
    # Read sentence SRT
    if sentence_file and os.path.exists(sentence_file):
        with open(sentence_file, 'r', encoding='utf-8') as f:
            data['sentence'] = f.read().strip()
    else:
        data['sentence'] = ""
    
    # Read word SRT
    if word_file and os.path.exists(word_file):
        with open(word_file, 'r', encoding='utf-8') as f:
            data['word'] = f.read().strip()
    else:
        data['word'] = ""
    
    # Save as JSON.GZ
    output_file = os.path.join(LYRICS_DIR, f"{video_id}.json.gz")
    with gzip.open(output_file, 'wt', encoding='utf-8') as f:
        json.dump(data, f)
    
    print(f"Lyrics saved to: {output_file}")
    
    # Delete original files
    for file_path in [sentence_file, word_file]:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted: {file_path}")
    
    return output_file


# Legacy function for backward compatibility
def compress_chord_files(video_id, *files_to_compress):
    """
    Legacy function - redirects to save_chords_json.
    Kept for backward compatibility.
    """
    regular_file = None
    harmonic_file = None
    harmonicplus_file = None
    tuning_file = None
    
    for file_path in files_to_compress:
        if not file_path:
            continue
        base_name = os.path.basename(file_path).lower()
        if 'beginner' in base_name or 'regular' in base_name:
            regular_file = file_path
        elif 'advance2' in base_name:
            harmonic_file = file_path
        elif 'advance' in base_name or 'harmonic+' in base_name:
            harmonicplus_file = file_path
        elif 'tuning' in base_name:
            tuning_file = file_path
    
    return save_chords_json(
        video_id,
        harmonic_file,
        regular_file,
        harmonicplus_file,
        tuning_file,
        regularplus_file=harmonic_file,
        chord_engine_version="chordino-legacy-v1",
    )
