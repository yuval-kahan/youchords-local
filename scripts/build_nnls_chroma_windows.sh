#!/usr/bin/env bash
set -euo pipefail

# Build the official NNLS Chroma/Chordino and Vamp SDK sources for 64-bit Windows.
# Source revisions are pinned so the installer does not consume moving branches.
NNLS_COMMIT=4c5f214a75cb354f8d8c933e161377c5b4d83713
VAMP_SDK_COMMIT=63e0c3b37b6fb9ce6f074ea8222b4903e4f5568a
ROOT="$(pwd)"
WORK="$(mktemp -d)"
OUT="$ROOT/payload/vamp_plugins_windows"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
git clone --quiet https://github.com/c4dm/vamp-plugin-sdk.git "$WORK/vamp-plugin-sdk"
git -C "$WORK/vamp-plugin-sdk" checkout --quiet "$VAMP_SDK_COMMIT"
git clone --quiet https://github.com/c4dm/nnls-chroma.git "$WORK/nnls-chroma"
git -C "$WORK/nnls-chroma" checkout --quiet "$NNLS_COMMIT"

cd "$WORK"
INC="-I$WORK/vamp-plugin-sdk -I$WORK/nnls-chroma -I/mingw64/include"
FLAGS="-O2 -DNDEBUG -ffast-math"

cat > nnls-chroma.def <<'EOF'
EXPORTS
vampGetPluginDescriptor
EOF

gcc $FLAGS $INC -c nnls-chroma/nnls.c -o nnls.o
for source in \
  vamp-plugin-sdk/src/vamp-sdk/FFT.cpp \
  vamp-plugin-sdk/src/vamp-sdk/PluginAdapter.cpp \
  vamp-plugin-sdk/src/vamp-sdk/RealTime.cpp \
  nnls-chroma/NNLSBase.cpp \
  nnls-chroma/NNLSChroma.cpp \
  nnls-chroma/Chordino.cpp \
  nnls-chroma/Tuning.cpp \
  nnls-chroma/chromamethods.cpp \
  nnls-chroma/viterbi.cpp \
  nnls-chroma/plugins.cpp; do
  g++ $FLAGS $INC -c "$source" -o "$(basename "$source").o"
done

g++ -shared -o nnls-chroma.dll *.o nnls-chroma.def \
  -static -static-libgcc -static-libstdc++ -Wl,--enable-stdcall-fixup
cp nnls-chroma.dll \
  nnls-chroma/nnls-chroma.cat \
  nnls-chroma/nnls-chroma.n3 \
  nnls-chroma/COPYING \
  "$OUT/"

objdump -f "$OUT/nnls-chroma.dll" | grep -q 'pei-x86-64'
objdump -p "$OUT/nnls-chroma.dll" | grep -q 'vampGetPluginDescriptor'
