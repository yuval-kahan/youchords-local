#!/usr/bin/env bash
set -euo pipefail

payload_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
start_service=true
if [[ "${1:-}" == "--no-start" ]]; then start_service=false; fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This installer supports x86_64 Linux only." >&2
  exit 1
fi

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:24.04) ;;
    *) echo "This first native installer is validated for Ubuntu 24.04 x86_64." >&2; exit 1 ;;
  esac
else
  echo "Cannot identify this Linux distribution." >&2
  exit 1
fi

command -v systemctl >/dev/null || { echo "systemd is required for the background processor service." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "This installer currently needs apt-get." >&2; exit 1; }

if ! command -v ffmpeg >/dev/null \
  || ! dpkg-query -W -f='${Status}' libsndfile1 2>/dev/null | grep -q 'install ok installed' \
  || ! dpkg-query -W -f='${Status}' libgomp1 2>/dev/null | grep -q 'install ok installed'; then
  if command -v sudo >/dev/null; then
    sudo apt-get update
    sudo apt-get install -y ffmpeg libsndfile1 libgomp1
  elif [[ "${EUID}" -eq 0 ]]; then
    apt-get update
    apt-get install -y ffmpeg libsndfile1 libgomp1
  else
    echo "Install ffmpeg, libsndfile1, and libgomp1 with apt, then rerun this installer." >&2
    exit 1
  fi
fi

app_root="${HOME}/.local/share/YouChordsLocal/app"
data_root="${HOME}/.local/share/YouChordsLocal/data"
venv_root="${app_root}/venv"
venv_python="${venv_root}/bin/python"
uv="${payload_root}/runtime/uv"
node_bin="${payload_root}/runtime/node/bin"

[[ -x "${uv}" ]] || { echo "Bundled uv runtime manager is missing." >&2; exit 1; }
[[ -x "${node_bin}/node" ]] || { echo "Bundled Node.js runtime is missing." >&2; exit 1; }
[[ -d "${payload_root}/processor/sonic-annotator" && -d "${payload_root}/processor/vamp_plugins" ]] || {
  echo "Processor payload is incomplete; extract the complete Linux setup archive first." >&2
  exit 1
}

mkdir -p "${app_root}" "${data_root}" "${HOME}/.config/systemd/user" "${HOME}/.local/bin"
systemctl --user stop youchords-local.service >/dev/null 2>&1 || true
cp -R "${payload_root}/processor" "${app_root}/processor.new"
rm -rf "${app_root}/processor.old"
if [[ -d "${app_root}/processor" ]]; then mv "${app_root}/processor" "${app_root}/processor.old"; fi
mv "${app_root}/processor.new" "${app_root}/processor"
mkdir -p "${app_root}/runtime"
install -m 0755 "${uv}" "${app_root}/runtime/uv"
rm -rf "${app_root}/runtime/node"
cp -R "${payload_root}/runtime/node" "${app_root}/runtime/node"

export UV_CACHE_DIR="${HOME}/.cache/YouChordsLocal/uv"
mkdir -p "${UV_CACHE_DIR}"
echo "Installing the private Python 3.10 runtime..."
"${app_root}/runtime/uv" python install 3.10 --install-dir "${app_root}/runtime/python"
base_python=$(UV_PYTHON_INSTALL_DIR="${app_root}/runtime/python" \
  "${app_root}/runtime/uv" python find 3.10 --managed-python)
if [[ ! -x "${venv_python}" ]]; then
  "${app_root}/runtime/uv" venv --python "${base_python}" "${venv_root}"
fi

echo "Preparing Python build dependencies and Chordino support..."
"${app_root}/runtime/uv" pip install --python "${venv_python}" \
  'setuptools<81' wheel 'Cython<3' 'numpy<2' 'scipy<2' mido
madmom_source_root="$(mktemp -d "${UV_CACHE_DIR}/madmom.XXXXXX")"
trap 'rm -rf "${madmom_source_root}"' EXIT
"${app_root}/runtime/uv" pip download --no-deps --no-binary madmom \
  --dest "${madmom_source_root}" 'madmom==0.16.1'
tar -xzf "${madmom_source_root}/madmom-0.16.1.tar.gz" -C "${madmom_source_root}"
madmom_source="${madmom_source_root}/madmom-0.16.1"
(
  cd "${madmom_source}"
  "${venv_root}/bin/cythonize" -f -3 \
    madmom/audio/comb_filters.pyx \
    madmom/features/beats_crf.pyx \
    madmom/ml/hmm.pyx \
    madmom/ml/nn/layers.py
)
"${app_root}/runtime/uv" pip install --python "${venv_python}" \
  --no-build-isolation --no-deps "${madmom_source}"

if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then
  backend_requirements="requirements.linux.cuda.txt"
  echo "NVIDIA GPU detected. Installing the CUDA processing runtime..."
else
  backend_requirements="requirements.linux.cpu.txt"
  echo "No usable NVIDIA GPU detected. Installing the CPU processing runtime..."
fi
"${app_root}/runtime/uv" pip install --python "${venv_python}" \
  -r "${app_root}/processor/requirements.linux.txt" \
  -r "${app_root}/processor/${backend_requirements}"

service_file="${HOME}/.config/systemd/user/youchords-local.service"
cat >"${service_file}" <<UNIT
[Unit]
Description=YouChords Local Linux Processor
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${app_root}/processor
Environment=PATH=${app_root}/runtime/node/bin:${venv_root}/bin:/usr/local/bin:/usr/bin:/bin
Environment=LD_LIBRARY_PATH=${app_root}/processor/sonic-annotator:${app_root}/processor/vamp_plugins:${venv_root}/lib/python3.10/site-packages/nvidia/cudnn/lib:${venv_root}/lib/python3.10/site-packages/nvidia/cublas/lib:${venv_root}/lib/python3.10/site-packages/nvidia/cuda_runtime/lib
Environment=HF_HOME=${data_root}/models/huggingface
Environment=YOUCHORDS_LOCAL_HOST=127.0.0.1
Environment=YOUCHORDS_LOCAL_PORT=8767
Environment=YOUCHORDS_LOCAL_DATA_DIR=${data_root}
Environment=YOUCHORDS_YTDLP_DATA_DIR=${data_root}/yt-dlp
Environment=YOUCHORDS_DEMUCS_DEVICE=auto
Environment=YOUCHORDS_WHISPER_DEVICE=auto
Environment=YOUCHORDS_WHISPER_MODEL_ROOT=${data_root}/models/whisper
Environment=YOUCHORDS_MELBAND_MODEL_ROOT=${data_root}/models/melband
Environment=YOUCHORDS_REGULAR_ENGINE=madmom
Environment=YOUCHORDS_SONIC_ANNOTATOR_BIN=${app_root}/processor/sonic-annotator/sonic-annotator
Environment=YOUCHORDS_SONIC_ANNOTATOR_LIB=${app_root}/processor/sonic-annotator
Environment=YOUCHORDS_VAMP_PATH=${app_root}/processor/vamp_plugins
Environment=YOUCHORDS_WHISPER_ENGINE=whisperx
Environment=YOUCHORDS_WHISPERX_BATCH_SIZE=8
Environment=SUBFLOW_API_BASE=http://127.0.0.1:18000
ExecStart=${venv_python} ${app_root}/processor/local_companion.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

cat >"${HOME}/.local/bin/youchords-linux-status" <<'STATUS'
#!/usr/bin/env bash
systemctl --user status youchords-local.service
STATUS
chmod +x "${HOME}/.local/bin/youchords-linux-status"
if [[ "${start_service}" == true ]]; then
  systemctl --user daemon-reload
  systemctl --user enable --now youchords-local.service
  echo "YouChords Linux processor installed. Health: http://127.0.0.1:8767/v1/health"
  echo "Choose Linux · port 8767 in the extension popup. It starts automatically when you sign in."
else
  echo "Linux runtime installed without starting the user service."
fi
