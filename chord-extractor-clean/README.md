# Chord Extractor & Lyrics Project

## מבנה הפרויקט
```
chord-extractor-clean/
├── router.py                 # נקודת כניסה ראשית
├── main.py                   # עיבוד אקורדים
├── compress_files.py         # שמירה ל-JSON.GZ
├── process_chords.py         # עיבוד קבצי אקורדים
├── convert_to_wav.py         # המרה ל-WAV
├── youtube_downloader.py     # הורדה מיוטיוב
├── requirements.txt          # תלויות
├── subtitle/                 # מודול כתוביות
│   ├── .env                  # API keys
│   ├── api_fallback_utils.py # ElevenLabs integration
│   ├── unified_workflow_v2...py
│   ├── timestamp_word_and_sentence_v8__...py
│   ├── youtube_downloader_m4a_only-v4-_best.py
│   └── youtube_music_guard.py
├── vamp_plugins/             # VAMP plugins לזיהוי אקורדים
│   └── nnls-chroma.so
├── output/                   # תיקיית פלט
│   ├── chords/              # {video_id}.json.gz
│   └── lyrics/              # {video_id}.json.gz
└── temp/                     # קבצים זמניים
```

## התקנה

```bash
# יצירת virtual environment
python3 -m venv venv
source venv/bin/activate

# התקנת תלויות
pip install -r requirements.txt

# הגדרת VAMP_PATH
export VAMP_PATH=$(pwd)/vamp_plugins
```

## הגדרת API Keys

ערוך את subtitle/.env:
```
ELEVENLABS_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```

## שימוש

```bash
# אקורדים בלבד
python router.py --url "https://youtube.com/watch?v=VIDEO_ID" --process-type "CHORDS"

# כתוביות בלבד
python router.py --url "https://youtube.com/watch?v=VIDEO_ID" --process-type "SUBTITLES"

# שניהם
python router.py --url "https://youtube.com/watch?v=VIDEO_ID" --process-type "BOTH"
```

## פורמט הפלט

### output/chords/{video_id}.json.gz
```json
{
  "regular": "0.046:D,6.78:G...",
  "harmonic": "0.046:A7/C#...",
  "harmonicPlus": "0.385:D...",
  "tuning": "440.25"
}
```

### output/lyrics/{video_id}.json.gz
```json
{
  "sentence": "1\n00:00:16,425 --> ...",
  "word": "1\n00:00:16,425 --> ..."
}
```

## דרישות מערכת
- Linux (tested on Ubuntu)
- Python 3.9+
- FFmpeg
- sonic-annotator (for some chord extraction modes)
