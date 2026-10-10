"""Local-only YouChords processing service.

The service intentionally has no cloud, account, billing, proxy, or hosted
storage integration. It downloads with yt-dlp, converts with FFmpeg, runs the
existing madmom/Chordino pipeline, and stores packed results on local disk.
"""

from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from collections import deque
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

import requests
from flask import Flask, Response, jsonify, request, send_file, stream_with_context
from requests_toolbelt.multipart.encoder import MultipartEncoder

import main as chord_engine
from device_runtime import inspect_torch_cuda, resolve_compute_device
from yt_dlp_updates import YtDlpUpdateManager, yt_dlp_command


APP_DIR = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("YOUCHORDS_LOCAL_DATA_DIR", str(APP_DIR))).expanduser().resolve()
TEMP_ROOT = DATA_ROOT / "temp"
RESULTS_DIR = DATA_ROOT / "output" / "chords"
SEPARATION_CACHE_ROOT = DATA_ROOT / "output" / "separation"
TRANSCRIPTION_CACHE_ROOT = DATA_ROOT / "output" / "transcriptions"
YTDLP_DATA_DIR = Path(
    os.environ.get("YOUCHORDS_YTDLP_DATA_DIR", str(DATA_ROOT / "output" / "yt-dlp"))
).expanduser().resolve()
PORT = int(os.environ.get("YOUCHORDS_LOCAL_PORT", "8765"))
HOST = str(os.environ.get("YOUCHORDS_LOCAL_HOST", "0.0.0.0")).strip() or "0.0.0.0"
MAX_QUEUE_SIZE = max(1, int(os.environ.get("YOUCHORDS_LOCAL_MAX_QUEUE", "8")))
JOB_RETENTION_SECONDS = max(300, int(os.environ.get("YOUCHORDS_LOCAL_JOB_RETENTION_SEC", "86400")))
MAX_RETAINED_JOBS = max(16, int(os.environ.get("YOUCHORDS_LOCAL_MAX_RETAINED_JOBS", "200")))
SUBFLOW_API_BASE = os.environ.get("SUBFLOW_API_BASE", "http://host.docker.internal:18000").rstrip("/")
SUBFLOW_MAX_QUEUE_SIZE = max(1, int(os.environ.get("YOUCHORDS_SUBFLOW_MAX_QUEUE", "4")))
SUBFLOW_MAX_SUBTITLE_BYTES = max(
    1024,
    int(os.environ.get("YOUCHORDS_SUBFLOW_MAX_SUBTITLE_BYTES", str(10 * 1024 * 1024))),
)
SEPARATION_MAX_QUEUE_SIZE = max(1, int(os.environ.get("YOUCHORDS_SEPARATION_MAX_QUEUE", "2")))
DEMUCS_MODEL = str(os.environ.get("YOUCHORDS_DEMUCS_MODEL", "htdemucs_6s")).strip() or "htdemucs_6s"
TORCH_CUDA_STATUS = inspect_torch_cuda()
CUDA_AVAILABLE = bool(TORCH_CUDA_STATUS["available"])
DEMUCS_REQUESTED_DEVICE = str(os.environ.get("YOUCHORDS_DEMUCS_DEVICE", "auto")).strip().lower() or "auto"
DEMUCS_DEVICE = resolve_compute_device(DEMUCS_REQUESTED_DEVICE, CUDA_AVAILABLE)
VOCAL_MUSIC_MODEL = str(
    os.environ.get("YOUCHORDS_VOCAL_MUSIC_MODEL", "melband-roformer-kim-vocals")
).strip() or "melband-roformer-kim-vocals"
MELBAND_MODEL_ROOT = Path(
    os.environ.get(
        "YOUCHORDS_MELBAND_MODEL_ROOT",
        str(DATA_ROOT / "output" / "models" / "melband"),
    )
).resolve()
SEPARATION_STEMS = ("vocals", "instrumental", "drums", "bass", "guitar", "piano", "other")
WHISPER_MODEL = str(os.environ.get("YOUCHORDS_WHISPER_MODEL", "large-v2")).strip() or "large-v2"
WHISPER_REQUESTED_DEVICE = str(os.environ.get("YOUCHORDS_WHISPER_DEVICE", "auto")).strip().lower() or "auto"
WHISPER_DEVICE = resolve_compute_device(WHISPER_REQUESTED_DEVICE, CUDA_AVAILABLE)
ACTIVE_ACCELERATOR = WHISPER_DEVICE if WHISPER_DEVICE == DEMUCS_DEVICE else "mixed"
WHISPER_ENGINE = str(os.environ.get("YOUCHORDS_WHISPER_ENGINE", "whisperx")).strip().lower() or "whisperx"
WHISPERX_BATCH_SIZE = max(1, int(os.environ.get("YOUCHORDS_WHISPERX_BATCH_SIZE", "8")))
if WHISPER_DEVICE == "cpu":
    WHISPERX_BATCH_SIZE = min(WHISPERX_BATCH_SIZE, 2)
WHISPER_MODEL_ROOT = Path(
    os.environ.get("YOUCHORDS_WHISPER_MODEL_ROOT", str(DATA_ROOT / "models" / "whisper"))
).resolve()
WHISPER_MODELS = {"tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3", "turbo"}
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
SUBFLOW_JOB_ID_RE = re.compile(r"^[a-f0-9]{32}$")
ALLOWED_ORIGIN_RE = re.compile(r"^(?:chrome-extension|moz-extension)://[A-Za-z0-9_-]+$")
ALLOWED_WEB_ORIGINS = {
    "https://www.youtube.com",
    "https://music.youtube.com",
}

TEMP_ROOT.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
SEPARATION_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
TRANSCRIPTION_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
UPDATE_MANAGER = YtDlpUpdateManager(YTDLP_DATA_DIR)

class ProcessingQueue:
    """A FIFO queue for the expensive chord, Whisper, and separation stages."""

    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._next_ticket = 1
        self._waiting: deque[int] = deque()

    def reserve(self) -> int:
        """Reserve a position as soon as the API accepts a processing job."""
        with self._condition:
            ticket = self._next_ticket
            self._next_ticket += 1
            self._waiting.append(ticket)
            self._condition.notify_all()
            return ticket

    def release(self, ticket: int | None) -> None:
        if ticket is None:
            return
        with self._condition:
            try:
                self._waiting.remove(ticket)
            except ValueError:
                return
            self._condition.notify_all()

    @contextmanager
    def slot(self, ticket: int, is_cancelled: Callable[[], bool]):
        """Wait for exactly this ticket's turn, then release it on exit."""
        with self._condition:
            while True:
                if ticket not in self._waiting:
                    raise RuntimeError("Processing queue ticket is no longer active")
                if self._waiting[0] == ticket:
                    break
                if is_cancelled():
                    self._waiting.remove(ticket)
                    self._condition.notify_all()
                    raise RuntimeError("Processing cancelled")
                self._condition.wait(timeout=0.25)
        try:
            yield
        finally:
            self.release(ticket)


app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="youchords-local")
subflow_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="youchords-subflow")
separation_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="youchords-separation")
transcription_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="youchords-transcription")
jobs: dict[str, dict[str, Any]] = {}
video_jobs: dict[str, str] = {}
active_processes: dict[str, subprocess.Popen] = {}
job_lock = threading.RLock()
subflow_jobs: dict[str, dict[str, Any]] = {}
subflow_active_processes: dict[str, subprocess.Popen] = {}
subflow_job_lock = threading.RLock()
separation_jobs: dict[str, dict[str, Any]] = {}
separation_video_jobs: dict[str, str] = {}
separation_active_processes: dict[str, subprocess.Popen] = {}
separation_job_lock = threading.RLock()
transcription_jobs: dict[str, dict[str, Any]] = {}
transcription_video_jobs: dict[str, str] = {}
transcription_active_processes: dict[str, subprocess.Popen] = {}
transcription_model_cache: dict[str, Any] = {}
transcription_alignment_cache: dict[str, tuple[Any, Any]] = {}
transcription_job_lock = threading.RLock()
transcription_model_lock = threading.RLock()
transcription_alignment_lock = threading.RLock()
# WhisperX, separation, and long chord analysis share the machine's compute
# resources. Keep their expensive sections serialized in request order so a
# long video cannot make the jobs fight over VRAM/RAM and take down the service.
processing_queue = ProcessingQueue()

SUBFLOW_TERMINAL_STATES = {"prepared", "completed", "failed", "cancelled", "interrupted"}
SEPARATION_TERMINAL_STATES = {"completed", "failed", "cancelled"}
TRANSCRIPTION_TERMINAL_STATES = {"completed", "failed", "cancelled"}
SUBFLOW_SAFE_OUTPUTS = {
    "source.srt",
    "source.json",
    "translation_system_prompt.txt",
    "translation_input.txt",
    "worker.log",
}
SUBFLOW_DEFAULT_SETTINGS = {
    "whisper_model": "large-v3",
    "source_language": "auto",
    "target_language": "he",
    "speaker_count": "auto",
    "diarization": True,
    "gender_detection": True,
    "professional_review": False,
}
SUBFLOW_ALLOWED_WHISPER_MODELS = {
    "large-v3",
    "large-v2",
    "medium",
    "small",
    "base",
    "tiny",
}


def _now() -> float:
    return time.time()


def _allowed_origin(origin: str | None) -> bool:
    if not origin or origin == "null":
        return True
    return bool(ALLOWED_ORIGIN_RE.match(origin) or origin in ALLOWED_WEB_ORIGINS)


def _setting_value(settings: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in settings:
            return settings[key]
    return default


def _setting_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return default


def _normalize_subflow_settings(raw_settings: Any, source_language: str = "auto") -> dict[str, Any]:
    raw = raw_settings if isinstance(raw_settings, dict) else {}
    whisper_model = str(_setting_value(
        raw,
        "whisper_model",
        "whisperModel",
        default=SUBFLOW_DEFAULT_SETTINGS["whisper_model"],
    )).strip().lower()
    if whisper_model not in SUBFLOW_ALLOWED_WHISPER_MODELS:
        whisper_model = SUBFLOW_DEFAULT_SETTINGS["whisper_model"]

    requested_source_language = str(_setting_value(
        raw,
        "source_language",
        "sourceLanguage",
        default=source_language or SUBFLOW_DEFAULT_SETTINGS["source_language"],
    )).strip().lower()
    if not re.fullmatch(r"(?:auto|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)", requested_source_language):
        requested_source_language = source_language or SUBFLOW_DEFAULT_SETTINGS["source_language"]

    target_language = str(_setting_value(
        raw,
        "target_language",
        "targetLanguage",
        default=SUBFLOW_DEFAULT_SETTINGS["target_language"],
    )).strip().lower()
    if not re.fullmatch(r"[a-z]{2,3}(?:-[a-z0-9]{2,8})*", target_language):
        target_language = SUBFLOW_DEFAULT_SETTINGS["target_language"]

    speaker_count_value = _setting_value(
        raw,
        "speaker_count",
        "speakerCount",
        default=SUBFLOW_DEFAULT_SETTINGS["speaker_count"],
    )
    speaker_count = str(speaker_count_value).strip().lower()
    if speaker_count != "auto":
        try:
            speaker_count_number = int(speaker_count)
        except (TypeError, ValueError):
            speaker_count_number = 0
        speaker_count = str(speaker_count_number) if 1 <= speaker_count_number <= 8 else "auto"

    return {
        "whisper_model": whisper_model,
        "source_language": requested_source_language,
        "target_language": target_language,
        "speaker_count": speaker_count,
        "diarization": _setting_bool(
            _setting_value(raw, "diarization", default=SUBFLOW_DEFAULT_SETTINGS["diarization"]),
            SUBFLOW_DEFAULT_SETTINGS["diarization"],
        ),
        "gender_detection": _setting_bool(
            _setting_value(raw, "gender_detection", "genderDetection", default=SUBFLOW_DEFAULT_SETTINGS["gender_detection"]),
            SUBFLOW_DEFAULT_SETTINGS["gender_detection"],
        ),
        "professional_review": _setting_bool(
            _setting_value(raw, "professional_review", "professionalReview", default=SUBFLOW_DEFAULT_SETTINGS["professional_review"]),
            SUBFLOW_DEFAULT_SETTINGS["professional_review"],
        ),
    }


@app.before_request
def _protect_local_api():
    origin = request.headers.get("Origin")
    if not _allowed_origin(origin):
        return jsonify({"success": False, "error": "Origin is not allowed"}), 403
    if request.method == "OPTIONS":
        return "", 204
    return None


@app.after_request
def _add_local_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin and _allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job["id"],
        "videoId": job["videoId"],
        "status": job["status"],
        "stage": job.get("stage"),
        "progress": job.get("progress", 0),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "cached": bool(job.get("cached")),
    }


def _public_subflow_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job["id"],
        "videoId": job["videoId"],
        "sourceMode": job["sourceMode"],
        "status": job["status"],
        "stage": job.get("stage"),
        "message": job.get("message"),
        "progress": job.get("progress", 0),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "subflowJobId": job.get("subflowJobId"),
        "outputs": job.get("outputs", []),
    }


def _public_separation_job(job: dict[str, Any]) -> dict[str, Any]:
    job_id = str(job["id"])
    stems = {
        stem: f"/v1/separation/jobs/{job_id}/stems/{stem}"
        for stem in job.get("stems", {})
        if stem in SEPARATION_STEMS
    }
    return {
        "id": job_id,
        "videoId": job["videoId"],
        "model": job.get("model", DEMUCS_MODEL),
        "device": DEMUCS_DEVICE,
        "status": job["status"],
        "stage": job.get("stage"),
        "progress": job.get("progress", 0),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "cached": bool(job.get("cached")),
        "stems": stems,
    }


def _public_transcription_job(job: dict[str, Any]) -> dict[str, Any]:
    public = {
        "id": str(job["id"]),
        "videoId": job["videoId"],
        "model": job.get("model", WHISPER_MODEL),
        "device": job.get("device", WHISPER_DEVICE),
        "engine": job.get("engine", WHISPER_ENGINE),
        "language": job.get("language") or "auto",
        "status": job["status"],
        "stage": job.get("stage"),
        "progress": job.get("progress", 0),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "cached": bool(job.get("cached")),
    }
    if job.get("status") == "completed" and job.get("result"):
        public["result"] = job["result"]
    return public


def _normalize_transcription_language(language: str | None) -> str:
    normalized = str(language or "").strip().lower()
    return "auto" if normalized in {"", "auto", "automatic"} else normalized


def _transcription_job_key(
    video_id: str,
    model: str = WHISPER_MODEL,
    language: str | None = None,
) -> str:
    """Keep active jobs unique per video, requested model, and language."""
    return f"{video_id}:{model}:{_normalize_transcription_language(language)}"


def _transcription_cache_dir(video_id: str, model: str, language: str | None = None) -> Path:
    normalized_language = _normalize_transcription_language(language)
    base_dir = TRANSCRIPTION_CACHE_ROOT / model / video_id
    # Keep the original location for automatic detection so existing caches
    # remain usable. Manual-language transcripts get an isolated cache folder
    # and can never be confused with an automatically detected transcript.
    if normalized_language == "auto":
        return base_dir
    safe_language = re.sub(r"[^a-z0-9-]+", "_", normalized_language)
    return base_dir / safe_language


def _load_cached_transcription(
    video_id: str,
    model: str,
    requested_language: str | None = None,
) -> dict[str, Any] | None:
    expected_language = _normalize_transcription_language(requested_language)
    cache_path = _transcription_cache_dir(video_id, model, expected_language) / "transcription.json"
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    if cached.get("videoId") != video_id or cached.get("model") != model:
        return None
    # Invalidate old OpenAI-Whisper-only caches. WhisperX alignment is the
    # source of truth for the word-level timestamps used by the UI.
    if cached.get("engine") != WHISPER_ENGINE:
        return None
    if not str(cached.get("sentenceSRT") or "").strip():
        return None
    cached_language = _normalize_transcription_language(cached.get("requestedLanguage"))
    if cached_language != expected_language:
        return None
    return cached


def _persist_transcription(
    video_id: str,
    model: str,
    result: dict[str, Any],
    job_id: str,
    requested_language: str | None = None,
) -> dict[str, Any]:
    cache_dir = _transcription_cache_dir(video_id, model, requested_language)
    partial_dir = cache_dir.with_name(f"{cache_dir.name}.partial-{job_id}")
    shutil.rmtree(partial_dir, ignore_errors=True)
    partial_dir.mkdir(parents=True, exist_ok=True)
    try:
        (partial_dir / "transcription.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        shutil.rmtree(cache_dir, ignore_errors=True)
        partial_dir.replace(cache_dir)
    except Exception:
        shutil.rmtree(partial_dir, ignore_errors=True)
        raise
    return result


def _format_srt_time(seconds: float) -> str:
    value = max(0.0, float(seconds))
    milliseconds = int(round(value * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _build_whisper_transcription(
    video_id: str,
    model: str,
    raw_result: dict[str, Any],
    word_level_engine: str = "openai-whisper",
    alignment_error: str | None = None,
    requested_language: str | None = None,
) -> dict[str, Any]:
    sentence_entries: list[dict[str, Any]] = []
    word_entries: list[dict[str, Any]] = []
    sentence_srt_parts: list[str] = []
    word_srt_parts: list[str] = []

    for segment in raw_result.get("segments") or []:
        start = float(segment.get("start") or 0.0)
        end = float(segment.get("end") or 0.0)
        text = " ".join(str(segment.get("text") or "").split()).strip()
        if not text or end <= start:
            continue
        sentence_entries.append({"text": text, "startTime": start, "endTime": end})
        index = len(sentence_entries)
        sentence_srt_parts.append(
            f"{index}\n{_format_srt_time(start)} --> {_format_srt_time(end)}\n{text}\n"
        )

        for word in segment.get("words") or []:
            word_text = " ".join(str(word.get("word") or "").split()).strip()
            word_start = float(word.get("start") or 0.0)
            word_end = float(word.get("end") or 0.0)
            if not word_text or word_end <= word_start:
                continue
            word_entries.append({"text": word_text, "startTime": word_start, "endTime": word_end})

    for index, word in enumerate(word_entries, start=1):
        word_srt_parts.append(
            f"{index}\n{_format_srt_time(word['startTime'])} --> {_format_srt_time(word['endTime'])}\n{word['text']}\n"
        )

    language_code = str(raw_result.get("language") or "auto").strip().lower() or "auto"
    language_name = f"Whisper {model}"
    if language_code != "auto":
        language_name = f"{language_name} ({language_code})"
    return {
        "videoId": video_id,
        "model": model,
        "engine": WHISPER_ENGINE,
        "requestedLanguage": _normalize_transcription_language(requested_language),
        "wordLevelEngine": word_level_engine,
        "source": "whisper",
        "sentenceSRT": "\n".join(sentence_srt_parts).strip() + ("\n" if sentence_srt_parts else ""),
        "wordSRT": "\n".join(word_srt_parts).strip() + ("\n" if word_srt_parts else ""),
        "originalSentences": sentence_entries,
        "languageCode": language_code,
        "languageName": language_name,
        "isAutoGenerated": False,
        "hasSubtitles": bool(sentence_entries),
        "hasWordLevel": bool(word_entries),
        "alignmentError": alignment_error,
        "createdAt": _now(),
    }


def _set_transcription_job(job_id: str, **updates: Any) -> None:
    with transcription_job_lock:
        job = transcription_jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updatedAt"] = _now()


def _is_cancel_requested(
    registry: dict[str, dict[str, Any]],
    registry_lock: threading.RLock,
    job_id: str,
) -> bool:
    with registry_lock:
        return bool(registry.get(job_id, {}).get("cancelRequested"))


def _separation_cache_dir(video_id: str, model: str) -> Path:
    return SEPARATION_CACHE_ROOT / model / video_id


def _separation_job_key(video_id: str, model: str) -> str:
    return f"{video_id}:{model}"


def _load_cached_separation_stems(video_id: str, model: str) -> dict[str, str]:
    cache_dir = _separation_cache_dir(video_id, model)
    manifest_path = cache_dir / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}

    if manifest.get("videoId") != video_id or manifest.get("model") != model:
        return {}

    stems = {
        stem: str(cache_dir / f"{stem}.wav")
        for stem in SEPARATION_STEMS
        if (cache_dir / f"{stem}.wav").is_file()
        and (cache_dir / f"{stem}.wav").stat().st_size > 0
    }
    return stems if "vocals" in stems else {}


def _persist_separation_stems(
    video_id: str,
    model: str,
    stem_paths: dict[str, str],
    job_id: str,
) -> dict[str, str]:
    cache_dir = _separation_cache_dir(video_id, model)
    partial_dir = cache_dir.with_name(f"{cache_dir.name}.partial-{job_id}")
    shutil.rmtree(partial_dir, ignore_errors=True)
    partial_dir.mkdir(parents=True, exist_ok=True)
    try:
        for stem, source_path in stem_paths.items():
            shutil.copy2(source_path, partial_dir / f"{stem}.wav")
        (partial_dir / "manifest.json").write_text(
            json.dumps(
                {
                    "videoId": video_id,
                    "model": model,
                    "stems": sorted(stem_paths),
                    "createdAt": _now(),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        shutil.rmtree(cache_dir, ignore_errors=True)
        partial_dir.replace(cache_dir)
    except Exception:
        shutil.rmtree(partial_dir, ignore_errors=True)
        raise

    return {
        stem: str(cache_dir / f"{stem}.wav")
        for stem in stem_paths
    }
    return {
        "id": job_id,
        "videoId": job["videoId"],
        "model": job.get("model", DEMUCS_MODEL),
        "status": job["status"],
        "stage": job.get("stage"),
        "progress": job.get("progress", 0),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "updatedAt": job["updatedAt"],
        "cached": bool(job.get("cached")),
        "stems": stems,
    }


def _set_job(job_id: str, **updates: Any) -> None:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updatedAt"] = _now()


def _set_subflow_job(job_id: str, **updates: Any) -> None:
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updatedAt"] = _now()


def _set_separation_job(job_id: str, **updates: Any) -> None:
    with separation_job_lock:
        job = separation_jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updatedAt"] = _now()


def _prune_jobs() -> None:
    cutoff = _now() - JOB_RETENTION_SECONDS
    with job_lock:
        removable = [
            job_id
            for job_id, job in jobs.items()
            if job.get("status") in {"completed", "failed", "cancelled"}
            and job.get("updatedAt", 0) < cutoff
        ]
        for job_id in removable:
            video_id = jobs[job_id]["videoId"]
            jobs.pop(job_id, None)
            if video_jobs.get(video_id) == job_id:
                video_jobs.pop(video_id, None)

        completed = sorted(
            (
                (job.get("updatedAt", 0), job_id)
                for job_id, job in jobs.items()
                if job.get("status") in {"completed", "failed", "cancelled"}
            ),
            reverse=True,
        )
        for _, job_id in completed[MAX_RETAINED_JOBS:]:
            video_id = jobs[job_id]["videoId"]
            jobs.pop(job_id, None)
            if video_jobs.get(video_id) == job_id:
                video_jobs.pop(video_id, None)


def _prune_subflow_jobs() -> None:
    cutoff = _now() - JOB_RETENTION_SECONDS
    with subflow_job_lock:
        removable = [
            job_id
            for job_id, job in subflow_jobs.items()
            if job.get("status") in SUBFLOW_TERMINAL_STATES
            and job.get("updatedAt", 0) < cutoff
        ]
        for job_id in removable:
            subflow_jobs.pop(job_id, None)

        terminal = sorted(
            (
                (job.get("updatedAt", 0), job_id)
                for job_id, job in subflow_jobs.items()
                if job.get("status") in SUBFLOW_TERMINAL_STATES
            ),
            reverse=True,
        )
        for _, job_id in terminal[MAX_RETAINED_JOBS:]:
            subflow_jobs.pop(job_id, None)


def _prune_separation_jobs() -> None:
    cutoff = _now() - JOB_RETENTION_SECONDS
    removed: list[dict[str, Any]] = []
    with separation_job_lock:
        removable = [
            job_id
            for job_id, job in separation_jobs.items()
            if job.get("status") in SEPARATION_TERMINAL_STATES
            and job.get("updatedAt", 0) < cutoff
        ]
        for job_id in removable:
            job = separation_jobs.pop(job_id, None)
            if job:
                removed.append(job)
            if job and separation_video_jobs.get(_separation_job_key(job["videoId"], job.get("model", DEMUCS_MODEL))) == job_id:
                separation_video_jobs.pop(_separation_job_key(job["videoId"], job.get("model", DEMUCS_MODEL)), None)

        terminal = sorted(
            (
                (job.get("updatedAt", 0), job_id)
                for job_id, job in separation_jobs.items()
                if job.get("status") in SEPARATION_TERMINAL_STATES
            ),
            reverse=True,
        )
        for _, job_id in terminal[MAX_RETAINED_JOBS:]:
            job = separation_jobs.pop(job_id, None)
            if job:
                removed.append(job)
                if separation_video_jobs.get(_separation_job_key(job["videoId"], job.get("model", DEMUCS_MODEL))) == job_id:
                    separation_video_jobs.pop(_separation_job_key(job["videoId"], job.get("model", DEMUCS_MODEL)), None)

    for job in removed:
        work_dir = job.get("workDir")
        if work_dir:
            shutil.rmtree(work_dir, ignore_errors=True)


def _prune_transcription_jobs() -> None:
    cutoff = _now() - JOB_RETENTION_SECONDS
    with transcription_job_lock:
        removable = [
            job_id
            for job_id, job in transcription_jobs.items()
            if job.get("status") in TRANSCRIPTION_TERMINAL_STATES
            and job.get("updatedAt", 0) < cutoff
        ]
        for job_id in removable:
            job = transcription_jobs.pop(job_id, None)
            if job:
                key = _transcription_job_key(
                    job["videoId"],
                    job.get("model", WHISPER_MODEL),
                    job.get("language"),
                )
                if transcription_video_jobs.get(key) == job_id:
                    transcription_video_jobs.pop(key, None)

        terminal = sorted(
            (
                (job.get("updatedAt", 0), job_id)
                for job_id, job in transcription_jobs.items()
                if job.get("status") in TRANSCRIPTION_TERMINAL_STATES
            ),
            reverse=True,
        )
        for _, job_id in terminal[MAX_RETAINED_JOBS:]:
            job = transcription_jobs.pop(job_id, None)
            if job:
                key = _transcription_job_key(
                    job["videoId"],
                    job.get("model", WHISPER_MODEL),
                    job.get("language"),
                )
                if transcription_video_jobs.get(key) == job_id:
                    transcription_video_jobs.pop(key, None)


def _result_path(video_id: str) -> Path:
    return RESULTS_DIR / f"{video_id}.json.gz"


def _tail(path: Path, limit: int = 12000) -> str:
    try:
        with path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - limit), os.SEEK_SET)
            return handle.read().decode("utf-8", errors="replace").strip()
    except OSError:
        return ""


def _run_command(job_id: str, command: list[str], log_path: Path) -> None:
    with log_path.open("ab") as log_handle:
        process = subprocess.Popen(
            command,
            cwd=str(APP_DIR),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        with job_lock:
            active_processes[job_id] = process
        try:
            while process.poll() is None:
                with job_lock:
                    cancelled = bool(jobs.get(job_id, {}).get("cancelRequested"))
                if cancelled:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Processing cancelled")
                time.sleep(0.25)
            if process.returncode != 0:
                detail = _tail(log_path)
                raise RuntimeError(detail or f"Command failed with exit code {process.returncode}")
        finally:
            with job_lock:
                active_processes.pop(job_id, None)


def _run_subflow_command(job_id: str, command: list[str], log_path: Path) -> None:
    with log_path.open("ab") as log_handle:
        process = subprocess.Popen(
            command,
            cwd=str(APP_DIR),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        with subflow_job_lock:
            subflow_active_processes[job_id] = process
        try:
            while process.poll() is None:
                with subflow_job_lock:
                    cancelled = bool(subflow_jobs.get(job_id, {}).get("cancelRequested"))
                if cancelled:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Processing cancelled")
                time.sleep(0.25)
            if process.returncode != 0:
                detail = _tail(log_path)
                raise RuntimeError(detail or f"Command failed with exit code {process.returncode}")
        finally:
            with subflow_job_lock:
                subflow_active_processes.pop(job_id, None)


def _run_separation_command(job_id: str, command: list[str], log_path: Path) -> None:
    with log_path.open("ab") as log_handle:
        process = subprocess.Popen(
            command,
            cwd=str(APP_DIR),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        with separation_job_lock:
            separation_active_processes[job_id] = process
        try:
            while process.poll() is None:
                with separation_job_lock:
                    current_job = separation_jobs.get(job_id, {})
                    cancelled = bool(current_job.get("cancelRequested"))
                    current_stage = current_job.get("stage")
                if cancelled:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Separation cancelled")
                if current_stage in {"demucs", "model"}:
                    log_text = _tail(log_path, 4000)
                    percentages = [int(value) for value in re.findall(r"(?<!\d)(\d{1,3})%", log_text)]
                    if percentages:
                        demucs_progress = max(28, min(99, 28 + round(max(percentages) * 0.71)))
                        _set_separation_job(job_id, progress=demucs_progress)
                time.sleep(0.5)
            if process.returncode != 0:
                detail = _tail(log_path)
                raise RuntimeError(detail or f"Audio separation command failed with exit code {process.returncode}")
        finally:
            with separation_job_lock:
                separation_active_processes.pop(job_id, None)


def _run_exclusive_gpu_separation_command(
    job_id: str,
    command: list[str],
    log_path: Path,
    stage: str,
    queue_ticket: int,
) -> None:
    """Run one separation model at a time in the shared FIFO queue."""
    _set_separation_job(job_id, status="separating", stage="compute-queue", progress=26)
    with processing_queue.slot(
        queue_ticket,
        lambda: _is_cancel_requested(separation_jobs, separation_job_lock, job_id),
    ):
        _set_separation_job(job_id, status="separating", stage=stage, progress=28)
        _run_separation_command(job_id, command, log_path)


def _run_transcription_command(job_id: str, command: list[str], log_path: Path) -> None:
    with log_path.open("ab") as log_handle:
        process = subprocess.Popen(
            command,
            cwd=str(APP_DIR),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        with transcription_job_lock:
            transcription_active_processes[job_id] = process
        try:
            while process.poll() is None:
                with transcription_job_lock:
                    cancelled = bool(transcription_jobs.get(job_id, {}).get("cancelRequested"))
                if cancelled:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Transcription cancelled")
                time.sleep(0.25)
            if process.returncode != 0:
                detail = _tail(log_path)
                raise RuntimeError(detail or f"Whisper audio download failed with exit code {process.returncode}")
        finally:
            with transcription_job_lock:
                transcription_active_processes.pop(job_id, None)


def _download_transcription_audio(job_id: str, video_id: str, work_dir: Path) -> Path:
    output_template = str(work_dir / "audio.%(ext)s")
    log_path = work_dir / "yt-dlp.log"
    command = [
        *yt_dlp_command(),
        "--no-playlist",
        "--no-progress",
        "--js-runtimes",
        "node",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-retries",
        "3",
        "--socket-timeout",
        "30",
        "-f",
        "bestaudio/best",
        "-o",
        output_template,
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    _set_transcription_job(
        job_id,
        status="downloading",
        stage="download",
        progress=8,
    )
    _run_transcription_command(job_id, command, log_path)
    candidates = [
        path
        for path in work_dir.glob("audio.*")
        if path.is_file() and path.name != log_path.name
    ]
    if not candidates:
        raise RuntimeError("yt-dlp finished without producing an audio file")
    return max(candidates, key=lambda path: path.stat().st_size)


def _get_whisper_model(model_name: str):
    import whisper

    with transcription_model_lock:
        model = transcription_model_cache.get(model_name)
        if model is None:
            WHISPER_MODEL_ROOT.mkdir(parents=True, exist_ok=True)
            model = whisper.load_model(
                model_name,
                device=WHISPER_DEVICE,
                download_root=str(WHISPER_MODEL_ROOT),
            )
            transcription_model_cache[model_name] = model
        return model


def _get_whisperx_model(model_name: str):
    """Load the WhisperX/faster-whisper ASR model once per model name."""
    import whisperx

    cache_key = f"whisperx:{model_name}"
    with transcription_model_lock:
        model = transcription_model_cache.get(cache_key)
        if model is None:
            WHISPER_MODEL_ROOT.mkdir(parents=True, exist_ok=True)
            compute_type = "float16" if WHISPER_DEVICE == "cuda" else "int8"
            model = whisperx.load_model(
                model_name,
                WHISPER_DEVICE,
                compute_type=compute_type,
                download_root=str(WHISPER_MODEL_ROOT),
            )
            transcription_model_cache[cache_key] = model
        return model


def _get_whisperx_alignment_model(language_code: str):
    """Load and cache the language-specific WhisperX forced aligner."""
    import whisperx

    cache_key = f"{language_code}:{WHISPER_DEVICE}"
    with transcription_alignment_lock:
        cached = transcription_alignment_cache.get(cache_key)
        if cached is None:
            cached = whisperx.load_align_model(
                language_code=language_code,
                device=WHISPER_DEVICE,
            )
            transcription_alignment_cache[cache_key] = cached
        return cached


def _transcribe_with_whisperx(
    audio_path: Path,
    model_name: str,
    language: str | None,
) -> dict[str, Any]:
    """Run WhisperX ASR and its forced-alignment pass on the same audio."""
    import whisperx

    audio = whisperx.load_audio(str(audio_path))
    model = _get_whisperx_model(model_name)
    result = model.transcribe(
        audio,
        batch_size=WHISPERX_BATCH_SIZE,
        language=language,
        task="transcribe",
    )
    detected_language = str(result.get("language") or language or "").strip().lower()
    if not detected_language:
        raise RuntimeError("WhisperX did not return a detected language")

    alignment_model, alignment_metadata = _get_whisperx_alignment_model(detected_language)
    aligned = whisperx.align(
        result.get("segments") or [],
        alignment_model,
        alignment_metadata,
        audio,
        WHISPER_DEVICE,
        return_char_alignments=False,
    )
    return {
        **result,
        "segments": aligned.get("segments") or result.get("segments") or [],
        "language": detected_language,
    }


def _transcribe_with_whisperx_exclusive(
    job_id: str,
    audio_path: Path,
    model_name: str,
    language: str | None,
    queue_ticket: int,
) -> dict[str, Any]:
    """Run WhisperX in the shared FIFO processing queue."""
    _set_transcription_job(job_id, status="transcribing", stage="compute-queue", progress=30)
    with processing_queue.slot(
        queue_ticket,
        lambda: _is_cancel_requested(transcription_jobs, transcription_job_lock, job_id),
    ):
        _set_transcription_job(job_id, status="transcribing", stage="whisperx", progress=40)
        return _transcribe_with_whisperx(audio_path, model_name, language)


def _transcribe_with_openai_whisper_exclusive(
    job_id: str,
    audio_path: Path,
    model_name: str,
    language: str | None,
    queue_ticket: int,
    stage: str = "whisper",
) -> dict[str, Any]:
    """Run the fallback OpenAI Whisper path in the shared FIFO queue."""
    _set_transcription_job(job_id, status="transcribing", stage="compute-queue", progress=30)
    with processing_queue.slot(
        queue_ticket,
        lambda: _is_cancel_requested(transcription_jobs, transcription_job_lock, job_id),
    ):
        _set_transcription_job(job_id, status="transcribing", stage=stage, progress=55)
        model = _get_whisper_model(model_name)
        return model.transcribe(
            str(audio_path),
            task="transcribe",
            language=language,
            word_timestamps=True,
            fp16=WHISPER_DEVICE == "cuda",
            condition_on_previous_text=True,
            verbose=False,
        )


def _submit_transcription_job(job_id: str) -> None:
    with transcription_job_lock:
        job = transcription_jobs.get(job_id)
        if not job:
            return
        video_id = job["videoId"]
        model_name = job.get("model", WHISPER_MODEL)
        queue_ticket = job.get("processingQueueTicket")
        if queue_ticket is None:
            queue_ticket = processing_queue.reserve()
            job["processingQueueTicket"] = queue_ticket
        # The public API uses "auto" as a friendly label, but openai-whisper
        # expects None when it should detect the language itself. Passing the
        # literal string "auto" makes Whisper raise: Unsupported language: auto.
        requested_language = str(job.get("language") or "").strip().lower()
        language = None if requested_language in {"", "auto", "automatic"} else requested_language

    work_dir = TEMP_ROOT / f"whisper-{job_id}"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    log_path = work_dir / "whisper.log"
    try:
        audio_path = _download_transcription_audio(job_id, video_id, work_dir)
        _set_transcription_job(job_id, status="transcribing", stage="model", progress=25)
        word_level_engine = "whisperx"
        alignment_error = None
        if WHISPER_ENGINE == "whisperx":
            _set_transcription_job(job_id, status="transcribing", stage="whisperx", progress=40)
            try:
                _set_transcription_job(job_id, status="transcribing", stage="word-alignment", progress=65)
                result = _transcribe_with_whisperx_exclusive(
                    job_id,
                    audio_path,
                    model_name,
                    language,
                    queue_ticket,
                )
            except Exception as whisperx_error:
                # Keep transcription usable if a language-specific aligner is
                # unavailable. The result is explicitly marked as fallback so
                # the cache can be diagnosed instead of silently looking like
                # a WhisperX result.
                alignment_error = str(whisperx_error)[-1000:]
                word_level_engine = "openai-whisper-fallback"
                _set_transcription_job(
                    job_id,
                    status="transcribing",
                    stage="whisperx-fallback",
                    progress=55,
                )
                result = _transcribe_with_openai_whisper_exclusive(
                    job_id,
                    audio_path,
                    model_name,
                    language,
                    queue_ticket,
                    stage="whisperx-fallback",
                )
        else:
            _set_transcription_job(job_id, status="transcribing", stage="whisper", progress=40)
            result = _transcribe_with_openai_whisper_exclusive(
                job_id,
                audio_path,
                model_name,
                language,
                queue_ticket,
            )
            word_level_engine = "openai-whisper"
        with transcription_job_lock:
            if transcription_jobs.get(job_id, {}).get("cancelRequested"):
                raise RuntimeError("Transcription cancelled")
        transcript = _build_whisper_transcription(
            video_id,
            model_name,
            result,
            word_level_engine=word_level_engine,
            alignment_error=alignment_error,
            requested_language=requested_language,
        )
        if not transcript["sentenceSRT"].strip():
            raise RuntimeError("Whisper completed without producing subtitle segments")
        cached_transcript = _persist_transcription(
            video_id,
            model_name,
            transcript,
            job_id,
            requested_language=requested_language,
        )
        _set_transcription_job(
            job_id,
            status="completed",
            stage="ready",
            progress=100,
            result=cached_transcript,
            cached=True,
        )
    except Exception as exc:
        with transcription_job_lock:
            cancelled = bool(transcription_jobs.get(job_id, {}).get("cancelRequested"))
        _set_transcription_job(
            job_id,
            status="cancelled" if cancelled else "failed",
            stage="cancelled" if cancelled else "failed",
            progress=0 if cancelled else 100,
            error=str(exc)[-4000:],
        )
    finally:
        processing_queue.release(queue_ticket)
        shutil.rmtree(work_dir, ignore_errors=True)


def _download_subflow_audio(job_id: str, video_id: str, work_dir: Path) -> Path:
    output_template = str(work_dir / "audio.%(ext)s")
    log_path = work_dir / "yt-dlp.log"
    command = [
        *yt_dlp_command(),
        "--no-playlist",
        "--no-progress",
        "--js-runtimes",
        "node",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-retries",
        "3",
        "--socket-timeout",
        "30",
        "-f",
        "bestaudio/best",
        "-o",
        output_template,
        f"https://www.youtube.com/watch?v={video_id}",
    ]

    _set_subflow_job(
        job_id,
        status="downloading",
        stage="download",
        message="Downloading the soundtrack locally",
        progress=8,
    )
    last_error: RuntimeError | None = None
    for attempt in range(2):
        try:
            _run_subflow_command(job_id, command, log_path)
            last_error = None
            break
        except RuntimeError as exc:
            if str(exc) == "Processing cancelled":
                raise
            last_error = exc
            if attempt == 0:
                for partial_path in work_dir.glob("audio.*"):
                    if partial_path.is_file() and partial_path != log_path:
                        partial_path.unlink(missing_ok=True)
                time.sleep(1)
    if last_error is not None:
        raise last_error

    candidates = [
        path
        for path in work_dir.glob("audio.*")
        if path.is_file() and path.name != log_path.name
    ]
    if not candidates:
        raise RuntimeError("yt-dlp finished without producing an audio file")
    return max(candidates, key=lambda path: path.stat().st_size)


def _download_separation_audio(job_id: str, video_id: str, work_dir: Path) -> Path:
    output_template = str(work_dir / "audio.%(ext)s")
    log_path = work_dir / "yt-dlp.log"
    command = [
        *yt_dlp_command(),
        "--no-playlist",
        "--no-progress",
        "--js-runtimes",
        "node",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-retries",
        "3",
        "--socket-timeout",
        "30",
        "-f",
        "bestaudio/best",
        "-o",
        output_template,
        f"https://www.youtube.com/watch?v={video_id}",
    ]

    _set_separation_job(
        job_id,
        status="downloading",
        stage="download",
        progress=8,
    )
    _run_separation_command(job_id, command, log_path)
    candidates = [
        path
        for path in work_dir.glob("audio.*")
        if path.is_file() and path.name != log_path.name
    ]
    if not candidates:
        raise RuntimeError("yt-dlp finished without producing an audio file")
    return max(candidates, key=lambda path: path.stat().st_size)


def _is_melband_model(model: str) -> bool:
    return str(model).strip() == VOCAL_MUSIC_MODEL


def _convert_separation_audio_to_wav(job_id: str, source_path: Path, work_dir: Path) -> Path:
    """MelBand-RoFormer accepts WAV input; normalize YouTube audio once."""
    wav_path = work_dir / "melband-input.wav"
    log_path = work_dir / "ffmpeg-convert.log"
    _set_separation_job(
        job_id,
        status="separating",
        stage="converting",
        progress=18,
    )
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "pcm_f32le",
        str(wav_path),
    ]
    _run_separation_command(job_id, command, log_path)
    if not wav_path.is_file() or wav_path.stat().st_size == 0:
        raise RuntimeError("FFmpeg did not produce the MelBand WAV input")
    return wav_path


def _submit_separation_job(job_id: str) -> None:
    with separation_job_lock:
        job = separation_jobs.get(job_id)
        if not job:
            return
        video_id = job["videoId"]
        model = job.get("model", DEMUCS_MODEL)
        queue_ticket = job.get("processingQueueTicket")
        if queue_ticket is None:
            queue_ticket = processing_queue.reserve()
            job["processingQueueTicket"] = queue_ticket

    work_dir = TEMP_ROOT / f"separation-{job_id}"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    log_path = work_dir / "demucs.log"
    try:
        audio_path = _download_separation_audio(job_id, video_id, work_dir)
        python_bin = os.environ.get("YOUCHORDS_DEMUCS_PYTHON", "python")
        stem_paths: dict[str, str] = {}

        if _is_melband_model(str(model)):
            melband_input = _convert_separation_audio_to_wav(job_id, audio_path, work_dir)
            input_dir = work_dir / "melband-input"
            output_dir = work_dir / "melband-output"
            input_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)
            input_path = input_dir / "audio.wav"
            shutil.copy2(melband_input, input_path)
            _set_separation_job(job_id, status="separating", stage="model", progress=28)
            command = [
                python_bin,
                "-m",
                "mel_band_roformer.inference",
                "--model",
                str(model),
                "--models_dir",
                str(MELBAND_MODEL_ROOT),
                "--input_folder",
                str(input_dir),
                "--store_dir",
                str(output_dir),
                "--device",
                DEMUCS_DEVICE,
            ]
            _run_exclusive_gpu_separation_command(
                job_id,
                command,
                log_path,
                "model",
                queue_ticket,
            )
            for stem in ("vocals", "instrumental"):
                matches = sorted(
                    path
                    for path in output_dir.glob(f"*_{stem}.wav")
                    if path.is_file()
                )
                if matches:
                    stem_paths[stem] = str(matches[0])
        else:
            _set_separation_job(job_id, status="separating", stage="demucs", progress=28)
            separated_dir = work_dir / "separated"
            separated_dir.mkdir(parents=True, exist_ok=True)
            command = [
                python_bin,
                "-m",
                "demucs.separate",
                "-n",
                str(model),
                "-d",
                DEMUCS_DEVICE,
                "--float32",
                "--segment",
                "7",
                "-o",
                str(separated_dir),
                str(audio_path),
            ]
            _run_exclusive_gpu_separation_command(
                job_id,
                command,
                log_path,
                "demucs",
                queue_ticket,
            )
            for stem in SEPARATION_STEMS:
                matches = sorted(
                    path
                    for path in separated_dir.rglob(f"{stem}.wav")
                    if path.is_file()
                )
                if matches:
                    stem_paths[stem] = str(matches[0])

        if "vocals" not in stem_paths:
            detail = _tail(log_path)
            raise RuntimeError(detail or "The separation model completed without producing a vocals stem")

        cached_stem_paths = _persist_separation_stems(
            video_id,
            str(model),
            stem_paths,
            job_id,
        )

        _set_separation_job(
            job_id,
            status="completed",
            stage="ready",
            progress=100,
            stems=cached_stem_paths,
            cached=True,
        )
    except Exception as exc:
        with separation_job_lock:
            cancelled = bool(separation_jobs.get(job_id, {}).get("cancelRequested"))
        _set_separation_job(
            job_id,
            status="cancelled" if cancelled else "failed",
            stage="cancelled" if cancelled else "failed",
            progress=0 if cancelled else 100,
            error=str(exc)[-4000:],
        )
        shutil.rmtree(work_dir, ignore_errors=True)
    finally:
        processing_queue.release(queue_ticket)
        shutil.rmtree(work_dir, ignore_errors=True)


def _submit_subflow_job(job_id: str) -> None:
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        if not job:
            return
        video_id = job["videoId"]
        source_mode = job["sourceMode"]
        subtitle_srt = job.get("subtitleSrt", "")
        source_language = job.get("sourceLanguage", "auto")
        requested_settings = job.get("settings", {})

    work_dir = TEMP_ROOT / f"subflow-{job_id}"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    try:
        audio_path = _download_subflow_audio(job_id, video_id, work_dir)
        with subflow_job_lock:
            if subflow_jobs.get(job_id, {}).get("cancelRequested"):
                raise RuntimeError("Processing cancelled")

        settings = _normalize_subflow_settings(requested_settings, source_language)
        settings.update({
            "source_mode": source_mode,
            "source_language": source_language or settings["source_language"] or "auto",
            "prepare_only": True,
        })

        open_files = []
        try:
            audio_handle = audio_path.open("rb")
            open_files.append(audio_handle)
            if source_mode == "subtitles":
                subtitle_path = work_dir / "source.srt"
                subtitle_path.write_text(subtitle_srt, encoding="utf-8")
                subtitle_handle = subtitle_path.open("rb")
                open_files.append(subtitle_handle)
                fields = {
                    "settings": json.dumps(settings),
                    "file": ("source.srt", subtitle_handle, "application/x-subrip"),
                    "audio_file": (audio_path.name, audio_handle, "application/octet-stream"),
                }
            else:
                fields = {
                    "settings": json.dumps(settings),
                    "file": (audio_path.name, audio_handle, "application/octet-stream"),
                }

            encoder = MultipartEncoder(fields=fields)
            _set_subflow_job(
                job_id,
                status="submitting",
                stage="upload",
                message="Sending the local files to Subflow",
                progress=20,
            )
            response = requests.post(
                f"{SUBFLOW_API_BASE}/api/jobs",
                data=encoder,
                headers={"Content-Type": encoder.content_type},
                timeout=(15, 3600),
            )
            response.raise_for_status()
            data = response.json()
        finally:
            for handle in open_files:
                handle.close()

        subflow_job_id = str(data.get("id") or "")
        if not SUBFLOW_JOB_ID_RE.fullmatch(subflow_job_id):
            raise RuntimeError("Subflow returned an invalid job ID")
        _set_subflow_job(
            job_id,
            status=str(data.get("state") or "submitted"),
            stage=str(data.get("stage") or "queued"),
            message=str(data.get("message") or "Subflow is preparing the subtitles"),
            progress=int(data.get("progress") or 0),
            subflowJobId=subflow_job_id,
            outputs=[],
        )
    except Exception as exc:
        with subflow_job_lock:
            cancelled = bool(subflow_jobs.get(job_id, {}).get("cancelRequested"))
        error = str(exc)
        if isinstance(exc, requests.HTTPError) and exc.response is not None:
            try:
                error = str(exc.response.json().get("detail") or error)
            except (ValueError, AttributeError):
                error = exc.response.text or error
        _set_subflow_job(
            job_id,
            status="cancelled" if cancelled else "failed",
            stage="cancelled" if cancelled else "failed",
            message="Preparation cancelled" if cancelled else "Subflow preparation failed",
            error=error[-4000:],
        )
    finally:
        with subflow_job_lock:
            job = subflow_jobs.get(job_id)
            if job:
                job.pop("subtitleSrt", None)
        shutil.rmtree(work_dir, ignore_errors=True)


def _refresh_subflow_status(job_id: str) -> None:
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        if not job or not job.get("subflowJobId"):
            return
        if job.get("status") in SUBFLOW_TERMINAL_STATES:
            return
        remote_id = job["subflowJobId"]

    try:
        response = requests.get(f"{SUBFLOW_API_BASE}/api/jobs/{remote_id}", timeout=(5, 20))
        response.raise_for_status()
        data = response.json()
        outputs = []
        for output in data.get("outputs") or []:
            filename = str(output.get("filename") or "")
            if filename not in SUBFLOW_SAFE_OUTPUTS:
                continue
            outputs.append(
                {
                    "filename": filename,
                    "label": str(output.get("label") or filename),
                    "url": f"/v1/subflow/jobs/{job_id}/download/{filename}",
                }
            )
        state = str(data.get("state") or "processing")
        _set_subflow_job(
            job_id,
            status=state,
            stage=str(data.get("stage") or state),
            message=str(data.get("message") or "Subflow is preparing the subtitles"),
            progress=int(data.get("progress") or 0),
            error=data.get("error"),
            outputs=outputs,
        )
    except requests.RequestException as exc:
        _set_subflow_job(job_id, message="Waiting for the local Subflow service", error=str(exc)[-1000:])


def _download_and_convert(job_id: str, video_id: str, work_dir: Path) -> Path:
    source_template = str(work_dir / "source.%(ext)s")
    download_log = work_dir / "yt-dlp.log"
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    download_command = [
        *yt_dlp_command(),
        "--no-playlist",
        "--no-progress",
        "--js-runtimes",
        "node",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-retries",
        "3",
        "--socket-timeout",
        "30",
        "-f",
        "bestaudio/best",
        "-o",
        source_template,
        youtube_url,
    ]

    _set_job(job_id, status="downloading", stage="Downloading with yt-dlp", progress=8)
    last_download_error = None
    for attempt in range(2):
        try:
            _run_command(job_id, download_command, download_log)
            last_download_error = None
            break
        except RuntimeError as exc:
            if str(exc) == "Processing cancelled":
                raise
            last_download_error = exc
            if attempt == 0:
                with download_log.open("ab") as log_handle:
                    log_handle.write(b"\n[YouChords] Retrying the YouTube audio download once.\n")
                for partial_path in work_dir.glob("source.*"):
                    if partial_path.is_file():
                        partial_path.unlink(missing_ok=True)
                time.sleep(1)

    if last_download_error is not None:
        raise last_download_error

    candidates = [
        path
        for path in work_dir.glob("source.*")
        if path.is_file() and path.name != download_log.name
    ]
    if not candidates:
        raise RuntimeError("yt-dlp finished without producing an audio file")
    source_path = max(candidates, key=lambda path: path.stat().st_size)

    _set_job(job_id, status="converting", stage="Converting audio with FFmpeg", progress=24)
    wav_path = work_dir / f"{video_id}.wav"
    _run_command(
        job_id,
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
            str(wav_path),
        ],
        work_dir / "ffmpeg.log",
    )
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        raise RuntimeError("FFmpeg did not produce a valid WAV file")
    return wav_path


def _process_job(job_id: str) -> None:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return
        video_id = job["videoId"]
        queue_ticket = job.get("processingQueueTicket")
        if queue_ticket is None:
            queue_ticket = processing_queue.reserve()
            job["processingQueueTicket"] = queue_ticket

    work_dir = TEMP_ROOT / job_id
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    try:
        result_path = _result_path(video_id)
        if result_path.exists() and result_path.stat().st_size > 0:
            _set_job(job_id, status="completed", stage="Ready", progress=100, cached=True)
            return

        wav_path = _download_and_convert(job_id, video_id, work_dir)
        _set_job(job_id, status="analyzing", stage="Waiting for processing slot", progress=30)
        with processing_queue.slot(
            queue_ticket,
            lambda: _is_cancel_requested(jobs, job_lock, job_id),
        ):
            _set_job(job_id, status="analyzing", stage="Running madmom and Chordino", progress=32)
            if not chord_engine.process_wav_file(str(wav_path)):
                raise RuntimeError("Chord analysis did not produce a result")
        if not result_path.exists() or result_path.stat().st_size == 0:
            raise RuntimeError("Chord analysis completed without a result file")
        _set_job(job_id, status="completed", stage="Ready", progress=100, cached=False)
    except Exception as exc:
        with job_lock:
            cancelled = bool(jobs.get(job_id, {}).get("cancelRequested"))
        _set_job(
            job_id,
            status="cancelled" if cancelled else "failed",
            stage="Cancelled" if cancelled else "Failed",
            error=str(exc)[-4000:],
        )
    finally:
        processing_queue.release(queue_ticket)
        shutil.rmtree(work_dir, ignore_errors=True)


@app.get("/v1/health")
def health():
    with job_lock:
        active = sum(1 for job in jobs.values() if job.get("status") in {"queued", "downloading", "converting", "analyzing"})
    with subflow_job_lock:
        active_subflow = sum(
            1
            for job in subflow_jobs.values()
            if job.get("status") not in SUBFLOW_TERMINAL_STATES
        )
    with separation_job_lock:
        active_separation = sum(
            1
            for job in separation_jobs.values()
            if job.get("status") not in SEPARATION_TERMINAL_STATES
        )
    with transcription_job_lock:
        active_transcription = sum(
            1
            for job in transcription_jobs.values()
            if job.get("status") not in TRANSCRIPTION_TERMINAL_STATES
        )
    return jsonify(
        {
            "success": True,
            "service": "youchords-local",
            "mode": "local-only",
            "accelerator": {
                "mode": ACTIVE_ACCELERATOR,
                "cudaAvailable": CUDA_AVAILABLE,
                "gpuName": TORCH_CUDA_STATUS["name"],
                "whisperDevice": WHISPER_DEVICE,
                "separationDevice": DEMUCS_DEVICE,
                "detectionError": TORCH_CUDA_STATUS["error"],
            },
            "regularEngine": chord_engine.REGULAR_ENGINE,
            "engines": ["madmom", "chordino"],
            "activeJobs": active,
            "subflow": {
                "configured": bool(SUBFLOW_API_BASE),
                "activeJobs": active_subflow,
                "prepareOnly": True,
            },
            "separation": {
                "model": DEMUCS_MODEL,
                "vocalMusicModel": VOCAL_MUSIC_MODEL,
                "device": DEMUCS_DEVICE,
                "stems": list(SEPARATION_STEMS),
                "activeJobs": active_separation,
            },
            "transcription": {
                "engine": WHISPER_ENGINE,
                "wordLevel": "whisperx-forced-alignment" if WHISPER_ENGINE == "whisperx" else "openai-whisper",
                "model": WHISPER_MODEL,
                "device": WHISPER_DEVICE,
                "activeJobs": active_transcription,
                "cachedLocally": True,
            },
            "ytDlp": UPDATE_MANAGER.get_status(),
        }
    )


@app.get("/v1/updates/yt-dlp")
def yt_dlp_update_status():
    return jsonify({"success": True, "update": UPDATE_MANAGER.check_if_due()})


def _active_job_count() -> int:
    active = 0
    with job_lock:
        active += sum(job.get("status") in {"queued", "downloading", "converting", "analyzing"} for job in jobs.values())
    with transcription_job_lock:
        active += sum(job.get("status") not in TRANSCRIPTION_TERMINAL_STATES for job in transcription_jobs.values())
    with separation_job_lock:
        active += sum(job.get("status") not in SEPARATION_TERMINAL_STATES for job in separation_jobs.values())
    with subflow_job_lock:
        active += sum(job.get("status") not in SUBFLOW_TERMINAL_STATES for job in subflow_jobs.values())
    return active


@app.post("/v1/updates/yt-dlp/install")
def install_yt_dlp_update():
    if _active_job_count():
        return jsonify({"success": False, "error": "Wait for local processing jobs to finish, then approve the update"}), 409
    result, status_code = UPDATE_MANAGER.install_latest()
    return jsonify(result), status_code


@app.post("/v1/jobs")
def create_job():
    if UPDATE_MANAGER.get_status()["installing"]:
        return jsonify({"success": False, "error": "A yt-dlp update is being installed; try again shortly"}), 503
    _prune_jobs()
    payload = request.get_json(silent=True) or {}
    video_id = str(payload.get("videoId") or "").strip()
    if not VIDEO_ID_RE.fullmatch(video_id):
        return jsonify({"success": False, "error": "Invalid YouTube video ID"}), 400

    result_path = _result_path(video_id)
    with job_lock:
        existing_id = video_jobs.get(video_id)
        existing = jobs.get(existing_id) if existing_id else None
        if existing and existing.get("status") not in {"failed", "cancelled"}:
            return jsonify({"success": True, "job": _public_job(existing)})

        active_count = sum(
            1
            for job in jobs.values()
            if job.get("status") in {"queued", "downloading", "converting", "analyzing"}
        )
        if active_count >= MAX_QUEUE_SIZE:
            return jsonify({"success": False, "error": "Local processing queue is full"}), 429

        job_id = uuid.uuid4().hex
        now = _now()
        queue_ticket = None if result_path.exists() else processing_queue.reserve()
        job = {
            "id": job_id,
            "videoId": video_id,
            "status": "completed" if result_path.exists() else "queued",
            "stage": "Ready" if result_path.exists() else "Waiting for local processor",
            "progress": 100 if result_path.exists() else 0,
            "error": None,
            "cached": result_path.exists(),
            "cancelRequested": False,
            "processingQueueTicket": queue_ticket,
            "createdAt": now,
            "updatedAt": now,
        }
        jobs[job_id] = job
        video_jobs[video_id] = job_id

    if job["status"] != "completed":
        executor.submit(_process_job, job_id)
    return jsonify({"success": True, "job": _public_job(job)}), 202


@app.get("/v1/jobs/<job_id>")
def get_job(job_id: str):
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        return jsonify({"success": True, "job": _public_job(job)})


@app.delete("/v1/jobs/<job_id>")
def cancel_job(job_id: str):
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        if job.get("status") in {"completed", "failed", "cancelled"}:
            return jsonify({"success": True, "job": _public_job(job)})
        job["cancelRequested"] = True
        job["updatedAt"] = _now()
        process = active_processes.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        return jsonify({"success": True, "job": _public_job(job)})


@app.post("/v1/transcription/jobs")
def create_transcription_job():
    if UPDATE_MANAGER.get_status()["installing"]:
        return jsonify({"success": False, "error": "A yt-dlp update is being installed; try again shortly"}), 503
    _prune_transcription_jobs()
    payload = request.get_json(silent=True) or {}
    video_id = str(payload.get("videoId") or "").strip()
    if not VIDEO_ID_RE.fullmatch(video_id):
        return jsonify({"success": False, "error": "Invalid YouTube video ID"}), 400

    requested_model = str(payload.get("model") or WHISPER_MODEL).strip().lower()
    if requested_model not in WHISPER_MODELS:
        return jsonify({"success": False, "error": "Unsupported Whisper model"}), 400
    language = _normalize_transcription_language(payload.get("language"))
    if language != "auto" and not re.fullmatch(r"[a-z]{2,3}(?:-[a-z0-9]{2,8})*", language):
        return jsonify({"success": False, "error": "Invalid Whisper language code"}), 400
    cached_result = _load_cached_transcription(video_id, requested_model, language)

    with transcription_job_lock:
        job_key = _transcription_job_key(video_id, requested_model, language)
        existing_id = transcription_video_jobs.get(job_key)
        existing = transcription_jobs.get(existing_id) if existing_id else None
        if existing and existing.get("status") not in TRANSCRIPTION_TERMINAL_STATES:
            return jsonify({"success": True, "job": _public_transcription_job(existing)})

        if cached_result:
            job_id = uuid.uuid4().hex
            now = _now()
            job = {
                "id": job_id,
                "videoId": video_id,
                "model": requested_model,
                "device": WHISPER_DEVICE,
                "engine": WHISPER_ENGINE,
                "language": cached_result.get("languageCode") or language,
                "status": "completed",
                "stage": "ready",
                "progress": 100,
                "error": None,
                "cached": True,
                "result": cached_result,
                "cancelRequested": False,
                "createdAt": now,
                "updatedAt": now,
            }
            transcription_jobs[job_id] = job
            transcription_video_jobs[job_key] = job_id
            return jsonify({"success": True, "job": _public_transcription_job(job)})

        active_count = sum(
            1
            for job in transcription_jobs.values()
            if job.get("status") not in TRANSCRIPTION_TERMINAL_STATES
        )
        if active_count >= SEPARATION_MAX_QUEUE_SIZE:
            return jsonify({"success": False, "error": "Whisper transcription queue is full"}), 429

        job_id = uuid.uuid4().hex
        now = _now()
        queue_ticket = processing_queue.reserve()
        job = {
            "id": job_id,
            "videoId": video_id,
            "model": requested_model,
            "device": WHISPER_DEVICE,
            "engine": WHISPER_ENGINE,
            "language": language,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "error": None,
            "cached": False,
            "result": None,
            "cancelRequested": False,
            "processingQueueTicket": queue_ticket,
            "createdAt": now,
            "updatedAt": now,
        }
        transcription_jobs[job_id] = job
        transcription_video_jobs[job_key] = job_id

    transcription_executor.submit(_submit_transcription_job, job_id)
    return jsonify({"success": True, "job": _public_transcription_job(job)}), 202


@app.get("/v1/transcription/jobs/<job_id>")
def get_transcription_job(job_id: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id):
        return jsonify({"success": False, "error": "Job not found"}), 404
    with transcription_job_lock:
        job = transcription_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        return jsonify({"success": True, "job": _public_transcription_job(job)})


@app.delete("/v1/transcription/jobs/<job_id>")
def cancel_transcription_job(job_id: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id):
        return jsonify({"success": False, "error": "Job not found"}), 404
    with transcription_job_lock:
        job = transcription_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        if job.get("status") in TRANSCRIPTION_TERMINAL_STATES:
            return jsonify({"success": True, "job": _public_transcription_job(job)})
        job["cancelRequested"] = True
        job["updatedAt"] = _now()
        process = transcription_active_processes.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        return jsonify({"success": True, "job": _public_transcription_job(job)})


@app.post("/v1/separation/jobs")
def create_separation_job():
    if UPDATE_MANAGER.get_status()["installing"]:
        return jsonify({"success": False, "error": "A yt-dlp update is being installed; try again shortly"}), 503
    _prune_separation_jobs()
    payload = request.get_json(silent=True) or {}
    video_id = str(payload.get("videoId") or "").strip()
    if not VIDEO_ID_RE.fullmatch(video_id):
        return jsonify({"success": False, "error": "Invalid YouTube video ID"}), 400

    requested_model = str(payload.get("model") or DEMUCS_MODEL).strip()
    allowed_models = {
        "htdemucs_6s",
        "htdemucs",
        "htdemucs_ft",
        "mdx_extra",
        VOCAL_MUSIC_MODEL,
    }
    if requested_model not in allowed_models:
        return jsonify({"success": False, "error": "Unsupported separation model"}), 400
    cached_stems = _load_cached_separation_stems(video_id, requested_model)

    with separation_job_lock:
        job_key = _separation_job_key(video_id, requested_model)
        existing_id = separation_video_jobs.get(job_key)
        existing = separation_jobs.get(existing_id) if existing_id else None
        if existing and existing.get("status") not in {"failed", "cancelled"}:
            return jsonify({"success": True, "job": _public_separation_job(existing)})

        if cached_stems:
            job_id = uuid.uuid4().hex
            now = _now()
            job = {
                "id": job_id,
                "videoId": video_id,
                "model": requested_model,
                "status": "completed",
                "stage": "ready",
                "progress": 100,
                "error": None,
                "cached": True,
                "stems": cached_stems,
                "cancelRequested": False,
                "createdAt": now,
                "updatedAt": now,
            }
            separation_jobs[job_id] = job
            separation_video_jobs[job_key] = job_id
            return jsonify({"success": True, "job": _public_separation_job(job)})

        active_count = sum(
            1
            for job in separation_jobs.values()
            if job.get("status") not in SEPARATION_TERMINAL_STATES
        )
        if active_count >= SEPARATION_MAX_QUEUE_SIZE:
            return jsonify({"success": False, "error": "Audio separation queue is full"}), 429

        job_id = uuid.uuid4().hex
        now = _now()
        queue_ticket = processing_queue.reserve()
        job = {
            "id": job_id,
            "videoId": video_id,
            "model": requested_model,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "error": None,
            "cached": False,
            "stems": {},
            "cancelRequested": False,
            "processingQueueTicket": queue_ticket,
            "createdAt": now,
            "updatedAt": now,
        }
        separation_jobs[job_id] = job
        separation_video_jobs[job_key] = job_id

    separation_executor.submit(_submit_separation_job, job_id)
    return jsonify({"success": True, "job": _public_separation_job(job)}), 202


@app.get("/v1/separation/jobs/<job_id>")
def get_separation_job(job_id: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id):
        return jsonify({"success": False, "error": "Job not found"}), 404
    with separation_job_lock:
        job = separation_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        return jsonify({"success": True, "job": _public_separation_job(job)})


@app.delete("/v1/separation/jobs/<job_id>")
def cancel_separation_job(job_id: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id):
        return jsonify({"success": False, "error": "Job not found"}), 404
    with separation_job_lock:
        job = separation_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        if job.get("status") in SEPARATION_TERMINAL_STATES:
            return jsonify({"success": True, "job": _public_separation_job(job)})
        job["cancelRequested"] = True
        job["updatedAt"] = _now()
        process = separation_active_processes.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        return jsonify({"success": True, "job": _public_separation_job(job)})


@app.get("/v1/separation/jobs/<job_id>/stems/<stem>")
def get_separation_stem(job_id: str, stem: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id) or stem not in SEPARATION_STEMS:
        return jsonify({"success": False, "error": "Stem not found"}), 404
    with separation_job_lock:
        job = separation_jobs.get(job_id)
        file_path = job.get("stems", {}).get(stem) if job else None
    if not file_path:
        return jsonify({"success": False, "error": "Stem not ready"}), 404
    resolved = Path(file_path).resolve()
    allowed_roots = (TEMP_ROOT.resolve(), SEPARATION_CACHE_ROOT.resolve())
    is_allowed_path = any(
        resolved == root or root in resolved.parents
        for root in allowed_roots
    )
    if not resolved.is_file() or not is_allowed_path:
        return jsonify({"success": False, "error": "Stem not found"}), 404
    return send_file(
        resolved,
        mimetype="audio/wav",
        as_attachment=False,
        conditional=True,
        download_name=f"{stem}.wav",
        max_age=0,
    )


@app.post("/v1/subflow/jobs")
def create_subflow_job():
    if UPDATE_MANAGER.get_status()["installing"]:
        return jsonify({"success": False, "error": "A yt-dlp update is being installed; try again shortly"}), 503
    _prune_subflow_jobs()
    payload = request.get_json(silent=True) or {}
    video_id = str(payload.get("videoId") or "").strip()
    source_mode = str(payload.get("sourceMode") or "").strip().lower()
    source_language = str(payload.get("sourceLanguage") or "auto").strip().lower()
    subtitle_srt = str(payload.get("subtitleSrt") or "")
    settings = _normalize_subflow_settings(payload.get("settings"), source_language)

    if not VIDEO_ID_RE.fullmatch(video_id):
        return jsonify({"success": False, "error": "Invalid YouTube video ID"}), 400
    if source_mode not in {"media", "subtitles"}:
        return jsonify({"success": False, "error": "sourceMode must be media or subtitles"}), 400
    if not re.fullmatch(r"(?:auto|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)", source_language):
        return jsonify({"success": False, "error": "Invalid source language"}), 400
    subtitle_bytes = len(subtitle_srt.encode("utf-8"))
    if source_mode == "subtitles" and not subtitle_srt.strip():
        return jsonify({"success": False, "error": "Subtitle source is required"}), 400
    if subtitle_bytes > SUBFLOW_MAX_SUBTITLE_BYTES:
        return jsonify({"success": False, "error": "Subtitle file is too large"}), 413

    with subflow_job_lock:
        active_count = sum(
            1
            for job in subflow_jobs.values()
            if job.get("status") not in SUBFLOW_TERMINAL_STATES
        )
        if active_count >= SUBFLOW_MAX_QUEUE_SIZE:
            return jsonify({"success": False, "error": "Subflow preparation queue is full"}), 429

        job_id = uuid.uuid4().hex
        now = _now()
        job = {
            "id": job_id,
            "videoId": video_id,
            "sourceMode": source_mode,
            "sourceLanguage": source_language,
            "subtitleSrt": subtitle_srt if source_mode == "subtitles" else "",
            "settings": settings,
            "status": "queued",
            "stage": "queued",
            "message": "Waiting for the local Subflow bridge",
            "progress": 0,
            "error": None,
            "outputs": [],
            "cancelRequested": False,
            "createdAt": now,
            "updatedAt": now,
        }
        subflow_jobs[job_id] = job

    subflow_executor.submit(_submit_subflow_job, job_id)
    return jsonify({"success": True, "job": _public_subflow_job(job)}), 202


@app.get("/v1/subflow/jobs/<job_id>")
def get_subflow_job(job_id: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id):
        return jsonify({"success": False, "error": "Job not found"}), 404
    with subflow_job_lock:
        if job_id not in subflow_jobs:
            return jsonify({"success": False, "error": "Job not found"}), 404
    _refresh_subflow_status(job_id)
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        return jsonify({"success": True, "job": _public_subflow_job(job)})


@app.delete("/v1/subflow/jobs/<job_id>")
def cancel_subflow_job(job_id: str):
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        if job.get("status") in SUBFLOW_TERMINAL_STATES:
            return jsonify({"success": True, "job": _public_subflow_job(job)})
        if job.get("subflowJobId"):
            return jsonify(
                {
                    "success": False,
                    "error": "Subflow has already accepted this job and will finish it locally",
                }
            ), 409
        job["cancelRequested"] = True
        job["updatedAt"] = _now()
        process = subflow_active_processes.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        return jsonify({"success": True, "job": _public_subflow_job(job)})


@app.get("/v1/subflow/jobs/<job_id>/download/<filename>")
def download_subflow_output(job_id: str, filename: str):
    if not SUBFLOW_JOB_ID_RE.fullmatch(job_id) or filename not in SUBFLOW_SAFE_OUTPUTS:
        return jsonify({"success": False, "error": "File not found"}), 404
    with subflow_job_lock:
        job = subflow_jobs.get(job_id)
        remote_id = job.get("subflowJobId") if job else None
    if not remote_id or not SUBFLOW_JOB_ID_RE.fullmatch(str(remote_id)):
        return jsonify({"success": False, "error": "File not found"}), 404

    try:
        upstream = requests.get(
            f"{SUBFLOW_API_BASE}/api/jobs/{remote_id}/download/{filename}",
            stream=True,
            timeout=(5, 60),
        )
        upstream.raise_for_status()
    except requests.RequestException as exc:
        return jsonify({"success": False, "error": f"Subflow download failed: {exc}"}), 502

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    content_type = upstream.headers.get("Content-Type") or "application/octet-stream"
    return Response(
        stream_with_context(generate()),
        content_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="subflow-{job_id[:8]}-{filename}"'},
    )


@app.get("/v1/results/<video_id>")
def get_result(video_id: str):
    if not VIDEO_ID_RE.fullmatch(video_id):
        return jsonify({"success": False, "error": "Invalid YouTube video ID"}), 400
    result_path = _result_path(video_id)
    if not result_path.exists():
        return jsonify({"success": False, "notInCache": True, "error": "Result not found"}), 404
    try:
        with gzip.open(result_path, "rt", encoding="utf-8") as handle:
            data = json.load(handle)
        return jsonify({"success": True, "chordsData": data})
    except (OSError, ValueError, json.JSONDecodeError):
        result_path.unlink(missing_ok=True)
        return jsonify({"success": False, "error": "Cached result is invalid; process the video again"}), 500


def _cleanup_stale_temp() -> None:
    for child in TEMP_ROOT.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)


if __name__ == "__main__":
    _cleanup_stale_temp()
    chord_engine.warm_madmom_regular_processor()
    UPDATE_MANAGER.start_daily_checks()
    app.run(host=HOST, port=PORT, threaded=True, use_reloader=False)
