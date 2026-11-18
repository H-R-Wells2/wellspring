# Wellspring

Wellspring by HRWells: a personal, Reels-style player for the vertical videos on your Android phone. Built with Expo (SDK 58) and runs in Expo Go.

## Run it

```bash
npm install
npx expo start          # same Wi-Fi as the phone
npx expo start --tunnel # if LAN doesn't work
```

Open **Expo Go** on the phone (signed in to the same Expo account) and scan the QR code.

## Using it

- **Home:** your folders as a wall, each block filled with its own reels and sized by how many it holds. **Tap** folders to mix them, then **Play** in the dock. **Hold** a folder to play just that one. **Everything** plays the whole library, and the shuffle button sits next to it.
- **Add folders** from Settings (for example `Download/Instagram`). Videos play in place and nothing is copied.

| On a reel | Action |
| --- | --- |
| Swipe up / down | Next / previous reel |
| Tap | Pause / play |
| Press and hold | 2× with natural-pitch audio; slide left/right to set 1.25×–3× |
| Pinch, or the Fit/Fill button | Whole frame or fill the screen, remembered per video |
| Drag the bottom bar | Scrub |
| Collect | Add to one of your collections |
| ••• | Repeat a section (A–B), mark seen, hide, delete |

Every video is shown whole (fit) by default. Feed order (newest, unseen first, shuffle, oldest), ambient glow and what happens when a reel ends are all in Settings.

Brand files are in `assets/brand/`.

## Code map

- `src/app/index.tsx`: Home, the folder wall (`src/lib/wall.ts` lays it out)
- `src/app/play.tsx`: the feed (paging list; only the current reel and its neighbours hold a player)
- `src/components/ReelItem.tsx`: player, gestures, overlay
- `src/components/ProgressBar.tsx`: scrubber
- `src/store/library.ts`: library state, persisted to AsyncStorage
- `src/lib/sources.ts`: folder and file picking, scanning
- `src/lib/thumbs.ts`: poster frames
- `src/theme.ts`: colours, fonts, spacing
