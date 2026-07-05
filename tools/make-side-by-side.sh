#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "usage: tools/make-side-by-side.sh video-a video-b mark-a-seconds mark-b-seconds output.mp4" >&2
  exit 2
fi

video_a="$1"
video_b="$2"
mark_a="$3"
mark_b="$4"
output="$5"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg is required. Install it locally before running this script." >&2
  exit 127
}

# Start both outputs at their aligned mark, then make a single 1280x720 video.
# This intentionally validates the "one decoded stream" architecture before we
# invest in browser-side or server-side generation.
ffmpeg -y \
  -ss "$mark_a" -i "$video_a" \
  -ss "$mark_b" -i "$video_b" \
  -filter_complex "\
[0:v]scale=640:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=640:720:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=PTS-STARTPTS[left];\
[1:v]scale=640:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=640:720:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=PTS-STARTPTS[right];\
[left][right]hstack=inputs=2,format=yuv420p[out]" \
  -map "[out]" \
  -an \
  -c:v libx264 \
  -preset veryfast \
  -crf 24 \
  -movflags +faststart \
  -t 12 \
  "$output"
