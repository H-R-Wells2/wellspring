# Wellspring architecture

Built to start fast and stay smooth with 10,000+ local videos.

```
 SAF folder (Android)                      SQLite (wellspring.db, WAL)
        │  async listing                    videos · sources · collections · kv
        ▼                                         ▲              │
 lib/sources.ts ── new files only ──► store ──────┘ diff flush   │ two-phase load
 (incremental scan)                (in-memory,  ◄────────────────┘
                                    immutable)
        lib/thumbs.ts ── 320px posters ──►  │  useLibrary(selector)
                                            ▼
                       feed (virtualized, ±1 players) · library grid (per-tile subscriptions)
```

## Startup (two phases)
1. **First frame:** read settings, sources and collections, then the first 24 videos *in the order the feed will show them* (an indexed query, under 1 ms). The splash hides and the first reel starts playing.
2. **Full load:** all rows are read on SQLite's thread (about 25 ms of SQL for 10k rows) and swapped in. Scans, search and counts run only after this point.

## Writes
- The store is immutable. Every change produces new objects only for what changed.
- `flush()` (debounced 800 ms, forced when the app goes to the background) compares the live state with the last flushed state by object identity. It then writes only the changed rows, plus deletions and hide/unhide, in one transaction. Saving a reel or a resume point writes one row.

## Scanning
- Folders are listed with the async Storage Access Framework (SAF) call, so the UI never blocks.
- Files already in the library cost no system calls. Names and extensions are read from the URI. Only new files get a file-info lookup, 8 in parallel.
- Removed files are dropped once listing finishes. New files are added 250 at a time, so a first scan fills the feed progressively.
- A folder that can't be read (permission lost, SD card out) is skipped and keeps its data.
- Rescans when you return to the app are throttled to once a minute.

## Rendering
- **Feed:** a paging FlatList with `getItemLayout`. Only the current reel and its two neighbours hold a video player. The feed order is recomputed only when `listVersion` changes (videos added, removed, saved or marked seen), never for resume points or thumbnails.
- **Library:** the FlatList receives only ids, and each tile subscribes to its own video, so a new thumbnail re-renders one tile. Search uses `useDeferredValue`.
- **Thumbnails:** 320 px JPEGs (about 20 KB), made newest-request-first from a capped queue, so on-screen tiles go first.
- **Gestures and animation** run on the UI thread (Reanimated / Gesture Handler).

## Budgets (10,000 videos)
| Path | Cost |
|---|---|
| Boot query | under 1 ms (index `videos_by_time`) |
| Full read | about 25 ms of SQL, plus row conversion |
| Save one change | 1 row |
| Rescan, nothing new | 1 async listing per folder, no file-info lookups |
| Disk | about 3 MB of database plus about 200 MB of thumbnails |

Expo Go runs a slow development build. Judge speed on a release build:
`npx eas-cli build -p android --profile preview`.
