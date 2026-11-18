# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
One user: HRWells, the owner. He watches his own downloaded Instagram reels on an Android phone, in relaxed lean-back sessions. The library is 10,000+ local files, mostly vertical video, spread across several folders.

## Product Purpose
Wellspring plays that personal library endlessly: one folder, several chosen folders, a collection, or everything. It adds viewing controls (hold-to-speed with slide, A–B section repeat, fit or fill per video, ambient glow). Success means opening the app and being inside the right stream of videos within a second, at any library size.

## Positioning
A private player for videos you already own, not a social feed. There are no likes, saves, sharing or social signals. Folders are the main way to organise videos because that is how the files are actually stored. Creative departures from the Reels pattern are welcome.

## Operating Context
- Files are read in place through Android's folder access (SAF). Nothing is copied.
- It runs in Expo Go during development; a release build comes later through EAS (project dc739458-fe3f-4e99-ac4a-c63f41cd0218).
- It must stay fast at 10,000+ files (see ARCHITECTURE.md).

## Capabilities and Constraints
- **Playback:** vertical paging feed; tap to pause; hold for 2× and slide to adjust speed (1.25–3×); A–B repeat; resume where you left off; loop or play the next reel; pinch for fit or fill.
- **Organising:** folders, collections, and the feed orders newest, unseen first, shuffle and oldest.
- **Removed by the owner:** Save/favourite, the double-tap action, Share, and the in-feed sound button. Double-tap does nothing.
- Expo Go limits: only native modules bundled with Expo Go, and no background playback.

## Brand Commitments
- **Name and wordmark:** Wellspring, by HRWells, written as **well**spring (bold + light, lowercase).
- **Mark:** a rounded tile with an open flowing-W channel and a dot (the spring and its drop). Files are in `assets/brand/`.
- **Palette and type:** warm black #0C0B0A, ember #FF5B2E, warm off-white #F4EFE7, Bricolage Grotesque.

## Evidence on Hand
The owner's real video library on the device. There is no marketing content, and none should be invented.

## Product Principles
1. The first frame is the content: get into a stream of videos in one tap.
2. Folders are the truth; collections are the owner's own layer on top.
3. Nothing social. The app serves the viewer, not engagement.
4. Speed at scale is a feature: 10,000 files must feel like 10.
