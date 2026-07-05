# trickline POC distribution

## Goal

Share the current comparison POC with a phone and keep it usable without the backend. The distributed build starts directly on the local A/B video comparison screen and loads videos from the device with file inputs.

## Current distribution shape

- Frontend only: the compare POC does not upload video files and does not require the backend.
- Static build: `npm run build` produces `frontend/dist`.
- PWA shell: the production build registers a service worker and includes a web app manifest, so the app shell can be reopened after first load.
- Phone workflow: open the hosted URL, choose two local videos from the phone, align both videos at `抜け`, then compare by step or simultaneous playback.

## Recommended POC rollout

1. Build the frontend.

   ```bash
   cd frontend
   npm run build
   ```

2. Host `frontend/dist` on a static host.

   Suitable options for this POC are Vercel, Netlify, Cloudflare Pages, GitHub Pages, or a local same-Wi-Fi preview. No server API is required for the comparison screen.

3. On iPhone/Android, open the URL and add it to the home screen if repeated testing is needed.

4. Use test videos that are short and similar in resolution/frame rate. For the first shared POC, keep clips around 10-30 seconds and prefer 1080p/30fps or lower.

## Jank risk and controls

Mobile jank mainly comes from decoding two local videos at once and from writing `currentTime` while videos are playing. The current implementation reduces repeated playback seeks, but it cannot fully remove device/codec limits.

For the first distribution test:

- Prefer step playback and slow playback for detailed timing checks.
- Avoid 4K, long clips, high bitrate exports, or mixed frame rates.
- If simultaneous playback still jitters on target phones, the next implementation step is a client-side or backend-assisted proxy video path that normalizes both clips before comparison.

## Acceptance checklist

- Production build completes.
- The distributed URL opens on iPhone Safari and Android Chrome.
- A/B local files can be selected from the phone.
- The app still works after reopening from the home screen once it has been loaded.
- Simultaneous playback is usable with 10-30 second 1080p/30fps test clips.
- Step playback remains reliable enough to set the `抜け` alignment point.
