#!/usr/bin/env bash
set -euo pipefail

version="${1:-2.3.0}"
payload_dir="${YOUCHORDS_LINUX_PAYLOAD:-}"
if [[ -z "${payload_dir}" || ! -x "${payload_dir}/runtime/uv" || ! -x "${payload_dir}/runtime/node/bin/node" ]]; then
  echo "Set YOUCHORDS_LINUX_PAYLOAD to a folder containing runtime/uv and runtime/node/bin/node." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "${staging}"' EXIT
bundle_root="${staging}/YouChords-Local-Linux-${version}"
mkdir -p "${bundle_root}/processor" "${bundle_root}/runtime"

cp "${repo_root}/chord-extractor-clean/local_companion.py" \
  "${repo_root}/chord-extractor-clean/main.py" \
  "${repo_root}/chord-extractor-clean/process_chords.py" \
  "${repo_root}/chord-extractor-clean/compress_files.py" \
  "${repo_root}/chord-extractor-clean/yt_dlp_updates.py" \
  "${repo_root}/chord-extractor-clean/device_runtime.py" \
  "${bundle_root}/processor/"
cp "${repo_root}/chord-extractor-clean/requirements.linux"*.txt "${bundle_root}/processor/"
cp -a "${repo_root}/chord-extractor-clean/sonic-annotator" "${bundle_root}/processor/"
cp -a "${repo_root}/chord-extractor-clean/vamp_plugins" "${bundle_root}/processor/"
cp "${repo_root}/scripts/install_linux.sh" "${bundle_root}/install.sh"
install -m 0755 "${payload_dir}/runtime/uv" "${bundle_root}/runtime/uv"
cp -a "${payload_dir}/runtime/node" "${bundle_root}/runtime/node"
if [[ -d "${payload_dir}/licenses" ]]; then cp -a "${payload_dir}/licenses" "${bundle_root}/licenses"; fi
chmod +x "${bundle_root}/install.sh" "${bundle_root}/runtime/uv" "${bundle_root}/runtime/node/bin/node"

mkdir -p "${repo_root}/dist"
tar -czf "${repo_root}/dist/YouChords-Local-Linux-Setup.tar.gz" -C "${staging}" "$(basename "${bundle_root}")"
sha256sum "${repo_root}/dist/YouChords-Local-Linux-Setup.tar.gz" > "${repo_root}/dist/YouChords-Local-Linux-Setup.tar.gz.sha256"

deb_root="${staging}/deb-root"
mkdir -p "${deb_root}/DEBIAN" "${deb_root}/opt/youchords-local-installer/bundle" "${deb_root}/usr/bin"
cp -a "${bundle_root}/." "${deb_root}/opt/youchords-local-installer/bundle/"
cat >"${deb_root}/DEBIAN/control" <<CONTROL
Package: youchords-local-setup
Version: ${version}
Section: sound
Priority: optional
Architecture: amd64
Depends: systemd, ffmpeg, libsndfile1, libgomp1
Maintainer: YouChords <opensource@youchords.local>
Description: YouChords local AI processor setup for Ubuntu and Debian
 Installs the private Python and AI processing runtime into the current user's home directory.
CONTROL
cat >"${deb_root}/usr/bin/youchords-local-setup" <<'LAUNCHER'
#!/bin/sh
set -eu
exec /opt/youchords-local-installer/bundle/install.sh "$@"
LAUNCHER
chmod 0755 "${deb_root}/usr/bin/youchords-local-setup"
dpkg-deb --build --root-owner-group "${deb_root}" "${repo_root}/dist/youchords-local_${version}_amd64.deb" >/dev/null
sha256sum "${repo_root}/dist/youchords-local_${version}_amd64.deb" > "${repo_root}/dist/youchords-local_${version}_amd64.deb.sha256"
echo "Created Linux tarball and Debian package in ${repo_root}/dist"
