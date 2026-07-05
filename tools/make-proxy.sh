#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: tools/make-proxy.sh input-video output-video.mp4" >&2
  exit 2
fi

input="$1"
output="$2"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg is required. Install it locally before running this script." >&2
  exit 127
}

ffmpeg -y \
  -i "$input" \
  -an \
  -vf "scale='min(720,iw)':-2:force_original_aspect_ratio=decrease,fps=30,format=yuv420p" \
  -c:v libx264 \
  -preset veryfast \
  -crf 24 \
  -movflags +faststart \
  "$output"
