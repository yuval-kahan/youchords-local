import os
import json
from pathlib import Path
import re
from collections import Counter
from functools import lru_cache

# We no longer need pychord as we'll use sonic-annotator for beginner chords

# Get the directory where this script is located
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Paths relative to app directory
TEMP_DIR = os.path.join(APP_DIR, "temp")
OUTPUT_DIR = os.path.join(APP_DIR, "output")
CHORD_PARSE_VERBOSE = os.environ.get("CHORD_PARSE_VERBOSE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
CHORD_MAJ7_VERBOSE = os.environ.get("CHORD_MAJ7_VERBOSE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Dictionary to convert MIDI note numbers to note names without octave
MIDI_TO_NOTE = {
    0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F',
    6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B'
}

# Common chord types and their interval patterns
CHORD_TYPES = {
    # Major chords
    (0, 4, 7): '',        # Major (C E G)
    (0, 4, 7, 11): 'maj7',  # Major 7th (C E G B)
    (0, 4, 7, 10): '7',     # Dominant 7th (C E G Bb)
    (0, 4, 7, 9): '6',      # Major 6th (C E G A)
    (0, 4, 7, 14): 'add9',  # Add9 (C E G D)
    
    # Minor chords
    (0, 3, 7): 'm',        # Minor (C Eb G)
    (0, 3, 7, 10): 'm7',    # Minor 7th (C Eb G Bb)
    (0, 3, 7, 11): 'mMaj7', # Minor Major 7th (C Eb G B)
    (0, 3, 6, 10): 'm7b5',  # Half-diminished (C Eb Gb Bb)
    (0, 3, 7, 9): 'm6',     # Minor 6th (C Eb G A)
    
    # Diminished and Augmented
    (0, 3, 6): 'dim',       # Diminished (C Eb Gb)
    (0, 3, 6, 9): 'dim7',   # Diminished 7th (C Eb Gb A)
    (0, 4, 8): 'aug',       # Augmented (C E G#)
    
    # Suspended chords
    (0, 5, 7): 'sus4',      # Suspended 4th (C F G)
    (0, 2, 7): 'sus2',      # Suspended 2nd (C D G)
    
    # Other common chords
    (0, 4, 7, 10, 14): '9',  # Dominant 9th (C E G Bb D)
    (0, 3, 7, 10, 14): 'm9', # Minor 9th (C Eb G Bb D)
}

def midi_to_note(midi_num, with_octave=True):
    """
    Convert MIDI note number to note name.
    
    Args:
        midi_num (int): MIDI note number
        with_octave (bool): Whether to include octave in the output
        
    Returns:
        str: Note name (e.g., 'C4', 'D#3' if with_octave=True, or 'C', 'D#' if with_octave=False)
    """
    try:
        midi_num = int(midi_num)
        octave = (midi_num // 12) - 1
        note = midi_num % 12
        if with_octave:
            return f"{MIDI_TO_NOTE[note]}{octave}"
        else:
            return MIDI_TO_NOTE[note]
    except (ValueError, KeyError):
        return f"Unknown({midi_num})"

# Chords that should NOT be converted to maj7 in Harmonic mode
# These basic chords should stay as regular major chords
FORCE_REGULAR_CHORDS = {'A', 'A#', 'A#M', 'Bb', 'D', 'D#', 'Eb', 'E', 'F', 'G', 'G#', 'Ab'}

def is_regular_major7_notation(chord_name):
    """
    True when REGULAR chord explicitly indicates major7.
    Supports both canonical "maj7" and alias notation like "A#M7".
    """
    if not chord_name:
        return False
    value = str(chord_name).strip()
    if value.endswith('maj7'):
        return True
    return bool(re.match(r'^[A-G](?:#|b)?M7$', value))

def fix_unwanted_maj7(chord_name, regular_chords=None, timestamp=None):
    """
    Fix unwanted maj7 detection for specific basic chords.
    In Harmonic mode, sometimes F, G, G# are incorrectly detected as Fmaj7, Gmaj7, G#maj7
    due to the "root lowering by half tone" phenomenon.
    
    NEW RULE: If the chord was MAJ7 in REGULAR mode, keep it as MAJ7.
    Only convert to regular if it was NOT MAJ7 in REGULAR.
    
    Args:
        chord_name (str): The detected chord name (e.g., 'Gmaj7', 'F', 'G#maj7')
        regular_chords (dict, optional): Dictionary mapping timestamps to REGULAR chords
        timestamp (float, optional): The timestamp of the current chord
        
    Returns:
        str: Corrected chord name (e.g., 'G', 'F', 'G#')
    """
    if not chord_name:
        return chord_name
    
    # Check if this is a maj7 chord that should be converted to regular
    for root in FORCE_REGULAR_CHORDS:
        candidate_maj7 = {f"{root}maj7"}
        # Alias support: "A#M" -> "A#M7"
        if root.endswith('M'):
            candidate_maj7.add(f"{root}7")
        if chord_name in candidate_maj7:
            # NEW: Check if it was MAJ7 in REGULAR - if so, keep it
            if regular_chords and timestamp is not None:
                regular_chord = get_chord_at_timestamp(regular_chords, timestamp)
                if is_regular_major7_notation(regular_chord):
                    if CHORD_MAJ7_VERBOSE:
                        print(f"[fix_unwanted_maj7] Keeping {chord_name} (was {regular_chord} in REGULAR)")
                    return chord_name

            # Keep output canonical ("A#M" root is normalized to "A#")
            normalized_root = root[:-1] if root.endswith('M') else root
            if CHORD_MAJ7_VERBOSE:
                print(f"[fix_unwanted_maj7] Converting {chord_name} -> {normalized_root}")
            return normalized_root
    
    return chord_name


def get_chord_at_timestamp(regular_chords, timestamp, tolerance=0.5):
    """
    Find the chord at a given timestamp from the REGULAR chords dictionary.
    Uses tolerance to find the closest match.
    
    Args:
        regular_chords (dict): Dictionary mapping timestamps to chord names
        timestamp (float): The timestamp to look up
        tolerance (float): Maximum time difference to consider a match
        
    Returns:
        str: The chord name at that timestamp, or None if not found
    """
    if not regular_chords:
        return None
    
    # Find the closest timestamp within tolerance
    closest_time = None
    min_diff = float('inf')
    
    for t in regular_chords.keys():
        diff = abs(t - timestamp)
        if diff < min_diff and diff <= tolerance:
            min_diff = diff
            closest_time = t
    
    if closest_time is not None:
        return regular_chords[closest_time]
    
    return None


def load_regular_chords(regular_file):
    """
    Load REGULAR chords from file into a dictionary.
    
    Args:
        regular_file (str): Path to the REGULAR chords file
        
    Returns:
        dict: Dictionary mapping timestamps to chord names
    """
    if not regular_file:
        return None
    
    try:
        if os.path.exists(regular_file):
            stats = os.stat(regular_file)
            return _load_regular_chords_from_file(
                os.path.abspath(regular_file),
                stats.st_mtime_ns,
                stats.st_size,
            )
        else:
            content = str(regular_file).strip()
            return _load_regular_chords_from_text(content)
    except Exception as e:
        print(f"[load_regular_chords] Error loading file: {e}")
        return None


@lru_cache(maxsize=64)
def _load_regular_chords_from_text(content):
    chords_dict = {}
    for item in content.split(','):
        if ':' in item:
            time_str, chord = item.split(':', 1)
            chords_dict[float(time_str)] = chord

    print(f"[load_regular_chords] Loaded {len(chords_dict)} chords from REGULAR file")
    return chords_dict


@lru_cache(maxsize=32)
def _load_regular_chords_from_file(file_path, _mtime_ns, _size):
    with open(file_path, 'r') as f:
        content = f.read().strip()
    return _load_regular_chords_from_text(content)


@lru_cache(maxsize=32)
def _load_sonic_csv_rows(csv_file, mtime_ns, size, is_chordnotes):
    if is_chordnotes:
        notes_by_timestamp = {}
        with open(csv_file, 'r') as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line:
                    continue

                parts = line.split(',')
                if len(parts) < 3:
                    continue

                timestamp = float(parts[0])
                midi_note = parts[2].strip('"')
                if timestamp not in notes_by_timestamp:
                    notes_by_timestamp[timestamp] = []
                notes_by_timestamp[timestamp].append(midi_note)

        rows = tuple((timestamp, tuple(midi_notes)) for timestamp, midi_notes in notes_by_timestamp.items())
    else:
        rows_list = []
        with open(csv_file, 'r') as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line:
                    continue

                parts = line.split(',')
                if len(parts) >= 3:
                    timestamp = float(parts[0])
                    chord = parts[2].strip('"')
                    rows_list.append((timestamp, chord))
                elif len(parts) >= 2:
                    timestamp = float(parts[0])
                    chord = parts[1].strip('"')
                    rows_list.append((timestamp, chord))

        rows = tuple(rows_list)

    return rows

def identify_chord(notes, apply_maj7_fix=False, regular_chords=None, timestamp=None):
    """
    Identify a chord from a list of MIDI note numbers.
    
    Args:
        notes (list): List of MIDI note numbers
        apply_maj7_fix (bool): Whether to apply the MAJ7 fix
        regular_chords (dict, optional): Dictionary mapping timestamps to REGULAR chords
        timestamp (float, optional): The timestamp of the current chord
        
    Returns:
        str: Chord name (e.g., 'C', 'Dm', 'G7')
    """
    if not notes:
        return "N"
    
    # Convert MIDI numbers to note names without octave
    note_names = [midi_to_note(note, with_octave=False) for note in notes]
    
    # Count occurrences of each note to handle duplicates
    note_counts = Counter(note_names)
    
    # Get unique notes
    unique_notes = list(note_counts.keys())
    
    # Need at least 2 notes to form a chord
    if len(unique_notes) < 2:
        return unique_notes[0] if unique_notes else "N"
    
    # Try to identify the root note (often the most common or lowest note)
    # For simplicity, we'll use the most common note as the root
    root_candidates = note_counts.most_common()
    root_note = root_candidates[0][0]
    
    # Convert notes to semitone intervals relative to the root
    intervals = []
    for note in unique_notes:
        # Calculate semitone distance from root
        root_idx = list(MIDI_TO_NOTE.values()).index(root_note)
        note_idx = list(MIDI_TO_NOTE.values()).index(note)
        interval = (note_idx - root_idx) % 12
        intervals.append(interval)
    
    # Sort intervals and normalize to start from 0
    intervals.sort()
    normalized_intervals = [(i - intervals[0]) % 12 for i in intervals]
    normalized_intervals = tuple(normalized_intervals)
    
    # Look for matching chord pattern
    chord_type = ""
    for pattern, name in CHORD_TYPES.items():
        # Check if all pattern intervals are in our normalized intervals
        if all(i in normalized_intervals for i in pattern) and len(pattern) >= len(normalized_intervals) - 1:
            chord_type = name
            break
    
    # If no match found but we have at least 3 notes, it might be a complex chord
    if not chord_type and len(unique_notes) >= 3:
        # Check if it might be a chord with bass note
        bass_note = note_names[0]  # Assume lowest note is bass
        if bass_note != root_note:
            chord_name = f"{root_note}{chord_type}/{bass_note}"
            if apply_maj7_fix:
                return fix_unwanted_maj7(chord_name, regular_chords, timestamp)
            return chord_name
    
    # Build chord name
    chord_name = f"{root_note}{chord_type}"
    
    # Apply fix for unwanted maj7 detection if requested
    if apply_maj7_fix:
        return fix_unwanted_maj7(chord_name, regular_chords, timestamp)
    
    return chord_name

def delete_temp_file(file_path):
    """
    Delete a temporary file if it exists.
    
    Args:
        file_path (str): Path to the file to delete
    """
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted temporary file: {file_path}")
        else:
            print(f"File not found or already deleted: {file_path}")
    except Exception as e:
        print(f"Error deleting file {file_path}: {str(e)}")

# We no longer need the chord simplification functions as we'll use sonic-annotator for beginner chords

def process_sonic_annotator_csv(csv_file, output_file=None, output_suffix="_chords_beginner.txt", regular_chords_file=None, delete_source=True, return_text=False):
    """
    Process a CSV file produced by sonic-annotator with the simplechord or chordnotes plugin.
    Convert it to our chord file format.
    
    Args:
        csv_file (str): Path to the CSV file produced by sonic-annotator
        output_file (str, optional): Path to save the output file. If None, a default path will be generated.
        output_suffix (str): Suffix to use for the output file name
        
    Returns:
        str: Path to the output chord file
    """
    print(f"Processing CSV file: {csv_file}")
    
    # Check if file exists
    if not os.path.exists(csv_file):
        print(f"Error: CSV file does not exist: {csv_file}")
        # Try to find any CSV files in the temp directory
        temp_files = [f for f in os.listdir(TEMP_DIR) if f.endswith('.csv')]
        if temp_files:
            print(f"Found these CSV files in {TEMP_DIR}: {temp_files}")
            # Use the first CSV file found
            csv_file = os.path.join(TEMP_DIR, temp_files[0])
            print(f"Using alternative CSV file: {csv_file}")
        else:
            print(f"No CSV files found in {TEMP_DIR}")
            return None
    
    # Determine if this is a chordnotes file (ADVANCE_2) based on the output suffix
    is_chordnotes = "_advance2" in output_suffix.lower()
    
    # Load REGULAR-mode chords for MAJ7 comparison (used by both modes when provided)
    regular_chords = None
    if regular_chords_file:
        regular_chords = load_regular_chords(regular_chords_file)
    
    try:
        chord_data = []
        stats = os.stat(csv_file)
        rows = _load_sonic_csv_rows(
            os.path.abspath(csv_file),
            stats.st_mtime_ns,
            stats.st_size,
            is_chordnotes,
        )

        if is_chordnotes:
            for timestamp, midi_notes in rows:
                chord = identify_chord(
                    midi_notes,
                    apply_maj7_fix=True,
                    regular_chords=regular_chords,
                    timestamp=timestamp,
                )
                chord_data.append((timestamp, chord))
                if CHORD_PARSE_VERBOSE:
                    print(f"Parsed chord: {timestamp} -> {midi_notes}")
        else:
            for timestamp, raw_chord in rows:
                chord = fix_unwanted_maj7(raw_chord, regular_chords, timestamp)
                chord_data.append((timestamp, chord))
                if CHORD_PARSE_VERBOSE:
                    print(f"Parsed chord: {timestamp} -> {chord}")
    except Exception as e:
        print(f"Error reading CSV file: {str(e)}")
        return None
    
    # Check if we found any chords
    if not chord_data:
        print(f"No chord data found in {csv_file}")
        return None
        
    print(f"Found {len(chord_data)} chords in the CSV file")
    
    # Sort by timestamp
    chord_data.sort(key=lambda x: x[0])
    
    # Merge consecutive identical chords
    merged_data = []
    prev_chord = None
    
    for timestamp, chord in chord_data:
        if chord != prev_chord:
            # Filter out "N" (No Chord) from all files
            if chord == "N":
                prev_chord = chord
                continue
            merged_data.append((timestamp, chord))
            prev_chord = chord
    
    print(f"After merging, we have {len(merged_data)} unique chord changes (filtered 'N' entries)")
    
    # Create chord sequence
    chord_sequence = []
    for timestamp, chord in merged_data:
        chord_sequence.append(f"{timestamp:.9f}:{chord}")
    
    # Format output
    formatted_output = ",".join(chord_sequence)
    
    # Determine chord type from suffix for logging
    if "_advance2" in output_suffix.lower():
        chord_type = "ADVANCE_2"
    else:
        chord_type = "Beginner"
    
    print(f"Chord file content length: {len(formatted_output)} characters")

    if return_text:
        print(f"{chord_type} chord text created from sonic-annotator")
        if delete_source:
            delete_temp_file(csv_file)
        return formatted_output

    # Create output filename if not provided
    if not output_file:
        # Generate a default filename based on the CSV filename
        file_stem = Path(csv_file).stem
        # Remove any plugin-specific suffix if present
        for suffix in ['_simplechord', '_chordino', '_chordnotes']:
            if file_stem.endswith(suffix):
                file_stem = file_stem[:-len(suffix)]
        # Use the video ID part of the filename
        video_id = file_stem.split('_vamp')[0]
        output_file = Path(OUTPUT_DIR) / f"{video_id}{output_suffix}"

    # Save chord file
    with open(output_file, 'w') as f:
        f.write(formatted_output)

    print(f"{chord_type} chord file created from sonic-annotator: {output_file}")

    # Delete the temporary CSV file unless caller needs another pass
    if delete_source:
        delete_temp_file(csv_file)
    
    # Return the file path
    return str(output_file)

def merge_consecutive_identical_chords(chord_sequence):
    """
    Merges consecutive identical chords in a sequence of time:chord pairs.
    
    Args:
        chord_sequence (list): List of strings in format "time:chord"
        
    Returns:
        list: Merged list of strings in format "time:chord"
    """
    if not chord_sequence:
        return []
    
    merged_sequence = []
    prev_chord = None
    
    for item in chord_sequence:
        time_str, chord = item.split(':', 1)
        
        # If this chord is different from the previous one, add it to the merged list
        if chord != prev_chord:
            merged_sequence.append(item)
            prev_chord = chord
    
    return merged_sequence

def process_chord_items(data, is_advanced=True, regular_chords_file=None, output_file=None, return_text=False):
    """
    Process in-memory chord items and optionally return the formatted chord text.

    Args:
        data (list): List of dicts with timestamp/chord keys
        is_advanced (bool): Whether this is a HARMONIC+ output
        regular_chords_file (str, optional): REGULAR/HARMONIC chord source
        output_file (str, optional): Optional output path
        return_text (bool): When True, skip file write and return formatted text

    Returns:
        str: Output file path or formatted chord text
    """
    # Sort data by timestamp to ensure proper ordering
    data.sort(key=lambda x: x['timestamp'])

    # Load REGULAR chords for comparison (for HARMONIC+ mode)
    regular_chords = None
    if is_advanced and regular_chords_file:
        regular_chords = load_regular_chords(regular_chords_file)

    # Process chords and merge consecutive identical chords
    merged_data = []
    prev_chord = None

    for item in data:
        current_chord = item['chord']
        timestamp = item['timestamp']

        # Apply fix for unwanted maj7 detection (for Harmonic+ mode)
        current_chord = fix_unwanted_maj7(current_chord, regular_chords, timestamp)

        # If this chord is different from the previous one, add it to the merged list
        # Filter out "N" (No Chord) for advanced (Harmonic+) files
        if current_chord != prev_chord:
            if is_advanced and current_chord == "N":
                prev_chord = current_chord
                continue
            merged_data.append({
                "timestamp": timestamp,
                "chord": current_chord,
            })
            prev_chord = current_chord

    if is_advanced:
        print("Filtered out 'N' (No Chord) entries for Harmonic+ file")

    chord_sequence = []
    for item in merged_data:
        chord_sequence.append(f"{item['timestamp']:.9f}:{item['chord']}")

    formatted_output = ",".join(chord_sequence)

    chord_type = "Advanced" if is_advanced else "Beginner"
    if return_text:
        print(f"{chord_type} chord text created")
        return formatted_output

    if output_file is None:
        raise ValueError("output_file is required when return_text is False")

    with open(output_file, 'w') as f:
        f.write(formatted_output)

    print(f"{chord_type} chord file created: {output_file}")
    return str(output_file)


def process_chord_file(json_file, is_advanced=True, regular_chords_file=None, return_text=False):
    """
    Processes the JSON file created by chord-extractor into the desired format.
    Creates a file with either advanced or beginner chords based on the is_advanced parameter.
    Merges consecutive identical chords, keeping only the first occurrence.
    
    Args:
        json_file (str): Path to the JSON file with chord data
        is_advanced (bool): Whether this is an advanced chord file (True) or beginner chord file (False)
        regular_chords_file (str, optional): Path to REGULAR chords file for MAJ7 comparison
        
    Returns:
        str: Path to the output chord file
    """
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    # Get file stem for output file
    # Remove _advanced or _beginner suffix if present in the JSON filename
    file_stem = Path(json_file).stem
    if file_stem.endswith('_advanced'):
        file_stem = file_stem[:-9]  # Remove '_advanced'
    elif file_stem.endswith('_beginner'):
        file_stem = file_stem[:-9]  # Remove '_beginner'
    
    # Create output filename based on type
    if is_advanced:
        output_file = Path(OUTPUT_DIR) / f"{file_stem}_chords_advance.txt"
    else:
        output_file = Path(OUTPUT_DIR) / f"{file_stem}_chords_beginner.txt"

    result = process_chord_items(
        data,
        is_advanced=is_advanced,
        regular_chords_file=regular_chords_file,
        output_file=output_file,
        return_text=return_text,
    )

    # Delete the temporary JSON file after processing
    delete_temp_file(json_file)

    return result
