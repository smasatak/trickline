# Video processing spikes

The current public POC uses two independent `<video>` elements and JavaScript
sync correction. That is useful as a measurement baseline, but it should not be
treated as the final architecture. Mobile jank can come from two simultaneous
decoders and from writing `currentTime` while playback is active.

## Goal

Find the smallest architecture that makes phone-shot snowboard clips usable for
side-by-side comparison on mobile.

## Spike A: proxy clips

Question: if both source videos are normalized to a light format, does the
current two-video comparison become good enough?

Target format:

- 720p or smaller
- 30fps
- H.264
- no audio
- short clips, roughly 10-30 seconds

Run:

```bash
tools/make-proxy.sh original-a.mov proxy-a.mp4
tools/make-proxy.sh original-b.mov proxy-b.mp4
```

Then open the public POC and compare the original pair versus the proxy pair
with the same marks.

Record:

- device, OS, browser
- original dimensions, fps if known, duration, size
- proxy duration and size
- stable mode result
- sync mode result
- whether step playback remains usable

Decision:

- If proxy clips remove most jank, build a real proxy-generation flow next.
- If proxy clips still jank, stop investing in two live videos as the main path.

## Spike B: one side-by-side video

Question: if A/B are baked into one video after selecting the marks, does
playback become stable enough for analysis and sharing?

Run:

```bash
tools/make-side-by-side.sh proxy-a.mp4 proxy-b.mp4 2.4 3.1 compare.mp4
```

The two numeric arguments are the aligned marks in seconds. The script starts
both videos at those marks, scales them to 640x720 each, and outputs one
1280x720 H.264 comparison clip.

Decision:

- If this plays smoothly, the product path should shift toward "choose marks,
  generate comparison clip, review/share one video".
- If this is too slow or too rigid, keep the interactive comparator for review
  and treat generated clips as a share/export feature.

## Do not jump straight to browser ffmpeg

Browser-side ffmpeg.wasm is not the first implementation target. It can be large
and memory-heavy on phones. Validate the architecture with local or server-side
FFmpeg first, then decide whether browser-side, server-side, or native
generation is worth implementing.
