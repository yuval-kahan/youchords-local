#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then
  echo "NVIDIA GPU detected. Trying the Docker GPU runtime..."
  if docker compose -f docker-compose.local.yml -f docker-compose.gpu.yml up --build -d; then
    echo "YouChords Local is starting with GPU support. Health: http://127.0.0.1:8765/v1/health"
    exit 0
  fi
  echo "Docker could not access the GPU. Starting on CPU instead."
  docker compose -f docker-compose.local.yml down || true
else
  echo "No NVIDIA GPU detected. Starting the Docker processor on CPU."
fi

docker compose -f docker-compose.local.yml up --build -d
echo "YouChords Local is starting. Health: http://127.0.0.1:8765/v1/health"
