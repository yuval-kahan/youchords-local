"""Daily, approval-gated yt-dlp updates for the local companion service."""

from __future__ import annotations

import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import requests
from packaging.version import InvalidVersion, Version


PYPI_RELEASE_URL = "https://pypi.org/pypi/yt-dlp/json"
CHECK_INTERVAL_SECONDS = 24 * 60 * 60


def _installed_version() -> str:
    try:
        return importlib.metadata.version("yt-dlp")
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


class YtDlpUpdateManager:
    """Check once a day and install only after the extension requests it."""

    def __init__(self, data_dir: Path):
        self._data_dir = Path(data_dir).expanduser().resolve()
        self._state_path = self._data_dir / "update-state.json"
        self._lock = threading.RLock()
        self._check_lock = threading.Lock()
        self._stop = threading.Event()
        self._state: dict[str, Any] = {
            "currentVersion": _installed_version(),
            "latestVersion": None,
            "lastChecked": None,
            "lastError": None,
            "installing": False,
            "installedVersion": None,
        }
        self._load_state()
        self._activate_installed_version()

    def _load_state(self) -> None:
        try:
            saved = json.loads(self._state_path.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                self._state.update({
                    key: saved.get(key)
                    for key in ("latestVersion", "lastChecked", "lastError", "installedVersion")
                })
        except (OSError, ValueError, TypeError):
            return

    def _save_state(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix="update-state-", suffix=".tmp", dir=self._data_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(self._state, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, self._state_path)
        finally:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass

    def _installed_package_dir(self, version: str | None) -> Path | None:
        if not version:
            return None
        candidate = self._data_dir / "active"
        return candidate if candidate.is_dir() else None

    def _activate_installed_version(self) -> None:
        version = self._state.get("installedVersion")
        package_dir = self._installed_package_dir(version)
        if not package_dir:
            self._state["installedVersion"] = None
            os.environ.pop("YOUCHORDS_YTDLP_ACTIVE", None)
            return
        existing = os.environ.get("PYTHONPATH", "")
        paths = [str(package_dir)] + [item for item in existing.split(os.pathsep) if item and item != str(package_dir)]
        os.environ["PYTHONPATH"] = os.pathsep.join(paths)
        os.environ["YOUCHORDS_YTDLP_ACTIVE"] = "1"
        self._state["currentVersion"] = str(version)

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            current = str(self._state.get("installedVersion") or self._state.get("currentVersion") or "unknown")
            latest = self._state.get("latestVersion")
            update_available = False
            if latest and current != "unknown":
                try:
                    update_available = Version(str(latest)) > Version(current)
                except InvalidVersion:
                    update_available = False
            return {
                "currentVersion": current,
                "latestVersion": latest,
                "updateAvailable": update_available,
                "lastChecked": self._state.get("lastChecked"),
                "lastError": self._state.get("lastError"),
                "installing": bool(self._state.get("installing")),
            }

    def _check(self, force: bool) -> dict[str, Any]:
        with self._check_lock:
            with self._lock:
                last_checked = self._state.get("lastChecked")
                if not force and last_checked and time.time() - int(last_checked) < CHECK_INTERVAL_SECONDS:
                    return self.get_status()
            try:
                response = requests.get(PYPI_RELEASE_URL, timeout=(5, 15))
                response.raise_for_status()
                version = str(response.json()["info"]["version"])
                Version(version)
                error = None
            except (requests.RequestException, KeyError, TypeError, ValueError, InvalidVersion) as exc:
                with self._lock:
                    self._state["lastChecked"] = int(time.time())
                    self._state["lastError"] = str(exc)[:300]
                    self._save_state()
                    return self.get_status()

            with self._lock:
                self._state["latestVersion"] = version
                self._state["lastChecked"] = int(time.time())
                self._state["lastError"] = error
                self._save_state()
                return self.get_status()

    def check_now(self) -> dict[str, Any]:
        return self._check(force=True)

    def check_if_due(self) -> dict[str, Any]:
        return self._check(force=False)

    def install_latest(self) -> tuple[dict[str, Any], int]:
        with self._lock:
            if self._state.get("installing"):
                return {"success": False, "error": "A yt-dlp update is already being installed"}, 409
            version = self._state.get("latestVersion")
            if not version:
                return {"success": False, "error": "Check for updates before installing"}, 409
            current = self.get_status()
            if not current["updateAvailable"]:
                return {"success": True, "status": current}, 200
            self._state["installing"] = True
            self._state["lastError"] = None
            self._save_state()

        self._data_dir.mkdir(parents=True, exist_ok=True)
        target = self._data_dir / "active"
        temp_target = self._data_dir / "active.installing"
        previous_target = self._data_dir / "active.previous"
        try:
            if temp_target.exists():
                shutil.rmtree(temp_target, ignore_errors=True)
            command = [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-warn-script-location",
                "--upgrade",
                "--target",
                str(temp_target),
                f"yt-dlp[default]=={version}",
            ]
            result = subprocess.run(command, capture_output=True, text=True, timeout=300, check=False)
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "pip failed without details")[-1200:]
                raise RuntimeError(detail)

            if previous_target.exists():
                shutil.rmtree(previous_target, ignore_errors=True)
            if target.exists():
                os.replace(target, previous_target)
            try:
                os.replace(temp_target, target)
            except OSError:
                if previous_target.exists() and not target.exists():
                    os.replace(previous_target, target)
                raise
            if previous_target.exists():
                shutil.rmtree(previous_target, ignore_errors=True)

            with self._lock:
                existing = os.environ.get("PYTHONPATH", "")
                paths = [str(target)] + [item for item in existing.split(os.pathsep) if item and item != str(target)]
                os.environ["PYTHONPATH"] = os.pathsep.join(paths)
                os.environ["YOUCHORDS_YTDLP_ACTIVE"] = "1"
                self._state["installedVersion"] = str(version)
                self._state["currentVersion"] = str(version)
                self._state["installing"] = False
                self._save_state()
                return {"success": True, "status": self.get_status()}, 200
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            with self._lock:
                self._state["installing"] = False
                self._state["lastError"] = str(exc)[-1200:]
                self._save_state()
                return {"success": False, "error": self._state["lastError"], "status": self.get_status()}, 500
        finally:
            if temp_target.exists():
                shutil.rmtree(temp_target, ignore_errors=True)
            if previous_target.exists() and target.exists():
                shutil.rmtree(previous_target, ignore_errors=True)

    def start_daily_checks(self) -> None:
        thread = threading.Thread(target=self._check_loop, name="youchords-ytdlp-updates", daemon=True)
        thread.start()

    def _check_loop(self) -> None:
        self.check_now()
        while not self._stop.wait(CHECK_INTERVAL_SECONDS):
            self.check_now()


def yt_dlp_command() -> list[str]:
    """Run yt-dlp from the active managed package, falling back to system PATH."""
    if os.environ.get("YOUCHORDS_YTDLP_ACTIVE") == "1":
        return [sys.executable, "-m", "yt_dlp"]
    return ["yt-dlp"]
