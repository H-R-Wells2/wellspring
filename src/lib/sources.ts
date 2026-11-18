import { Directory, File } from 'expo-file-system';
import * as Legacy from 'expo-file-system/legacy';

import { getState, setState, type Source, type Video } from '@/store/library';

/*
 * Built for big folders (5,000+ files):
 * - listing uses the async SAF call, so the UI never blocks;
 * - files already in the library cost zero extra system calls;
 * - names/extensions come from the URI itself, not one query per file;
 * - only genuinely new files are stat'ed, a few at a time, in the background.
 */

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;
const OTHER_EXT = /\.[a-z0-9]{1,5}$/i;
const MAX_DEPTH = 4;
const STAT_CONCURRENCY = 8;
const FOREGROUND_RESCAN_MS = 60_000;

type Found = Omit<Video, 'favorite' | 'position'>;

/** Known non-video, non-folder URIs (this session) so we never re-query them. */
const ignored = new Set<string>();
let lastScanAt = 0;

/** SAF document URIs end in an encoded path like primary%3ADownload%2FInstagram%2Freel.mp4 */
function nameFromUri(uri: string) {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri.replace(/\/$/, ''));
  } catch {}
  return decoded.split(/[/:]/).filter(Boolean).pop() ?? '';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function statNew(uri: string, sourceId: string, nameHint: string, folder: string): Promise<Found | null> {
  try {
    const info = await Legacy.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    let name = nameHint;
    if (!VIDEO_EXT.test(name)) {
      // Provider ids like "msf:1234" carry no name: ask once.
      const f = new File(uri);
      if (!(f.type ?? '').startsWith('video/')) return null;
      name = f.name;
    }
    return {
      id: uri,
      uri,
      name: name.replace(/\.[^.]+$/, ''),
      size: info.size ?? 0,
      mtime: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
      sourceId,
      folder,
    };
  } catch {
    return null;
  }
}

const COMMIT_CHUNK = 250;

/** Add a batch of new videos to the library (one state update, one DB transaction). */
function commitAdded(added: Found[]) {
  if (!added.length) return;
  setState((s) => {
    const videos = { ...s.videos };
    for (const f of added) if (!videos[f.id]) videos[f.id] = { ...f, favorite: false, position: 0 };
    return { videos, listVersion: s.listVersion + 1 };
  });
}

/** Record parent folders for videos that were indexed before folders were tracked. */
function commitFolders(fix: Record<string, string>) {
  const ids = Object.keys(fix);
  if (!ids.length) return;
  setState((s) => {
    const videos = { ...s.videos };
    for (const id of ids) if (videos[id]) videos[id] = { ...videos[id], folder: fix[id] };
    return { videos, listVersion: s.listVersion + 1 };
  });
}

/** Drop this source's videos that are no longer on disk. */
function commitRemovals(sourceId: string, stillThere: Set<string>) {
  const gone = Object.values(getState().videos).filter((v) => v.sourceId === sourceId && !stillThere.has(v.id));
  if (!gone.length) return;
  setState((s) => {
    const videos = { ...s.videos };
    for (const v of gone) delete videos[v.id];
    return { videos, listVersion: s.listVersion + 1 };
  });
}

/**
 * Scans one source and commits as it goes:
 *  1. list everything (async, no per-file calls for known files) → remove what disappeared;
 *  2. stat only new files, committing every 250 so the feed fills in progressively.
 * Returns the number of videos present, or null when the source can't be read right now
 * (permission lost, SD card out…), in which case nothing is touched.
 */
async function scanSource(source: Source, onProgress: (n: number) => void): Promise<number | null> {
  const { videos, hidden } = getState();
  const hiddenSet = new Set(hidden);
  const present = new Set<string>();
  const candidates: { uri: string; name: string; dir: string }[] = [];
  const folderFix: Record<string, string> = {}; // known videos indexed before folders existed

  if (source.kind === 'file') {
    const known = videos[source.uri];
    if (known) {
      if (known.folder !== 'picked') commitFolders({ [known.id]: 'picked' });
      return 1;
    }
    const f = await statNew(source.uri, source.id, source.name, 'picked');
    if (f) commitAdded([f]);
    return f ? 1 : 0;
  }

  const dirs: { uri: string; depth: number }[] = [{ uri: source.uri, depth: 0 }];
  while (dirs.length) {
    const { uri: dirUri, depth } = dirs.shift()!;
    let children: string[];
    try {
      children = await Legacy.StorageAccessFramework.readDirectoryAsync(dirUri);
    } catch {
      if (depth === 0) return null;
      continue;
    }
    const unknown: string[] = [];
    for (const child of children) {
      const known = videos[child];
      if (known) {
        present.add(child); // already indexed: no system calls at all
        if (known.folder !== dirUri) folderFix[child] = dirUri;
        continue;
      }
      if (hiddenSet.has(child) || ignored.has(child)) continue;
      const name = nameFromUri(child);
      if (VIDEO_EXT.test(name)) candidates.push({ uri: child, name, dir: dirUri });
      else if (OTHER_EXT.test(name)) ignored.add(child);
      else unknown.push(child); // a sub-folder, or a provider id without a name
    }
    // Resolve the unknowns (usually just a handful of folders).
    await mapLimit(unknown, STAT_CONCURRENCY, async (child) => {
      try {
        const info = await Legacy.getInfoAsync(child);
        if (info.exists && info.isDirectory) {
          if (depth < MAX_DEPTH && !nameFromUri(child).startsWith('.')) dirs.push({ uri: child, depth: depth + 1 });
        } else {
          candidates.push({ uri: child, name: nameFromUri(child), dir: dirUri });
        }
      } catch {
        ignored.add(child);
      }
    });
    onProgress(present.size + candidates.length);
  }

  // Listing is complete: anything indexed but not listed is gone.
  const stillThere = new Set(present);
  for (const c of candidates) stillThere.add(c.uri);
  commitRemovals(source.id, stillThere);
  commitFolders(folderFix);

  // New files: stat in parallel, commit in chunks so the feed grows while we work.
  let found = present.size;
  for (let i = 0; i < candidates.length; i += COMMIT_CHUNK) {
    const part = candidates.slice(i, i + COMMIT_CHUNK);
    const added = (await mapLimit(part, STAT_CONCURRENCY, (c) => statNew(c.uri, source.id, c.name, c.dir))).filter(
      (v): v is Found => v !== null,
    );
    part.forEach((c) => {
      if (!added.some((a) => a.id === c.uri)) ignored.add(c.uri);
    });
    commitAdded(added);
    found += added.length;
    onProgress(found);
  }
  return found;
}

async function runScan(sources: Source[]) {
  if (sources.length === 0) return 0;
  setState(() => ({ scanning: true, scanFound: 0 }));
  let total = 0;
  try {
    for (const src of sources) {
      const n = await scanSource(src, (k) => setState(() => ({ scanFound: total + k })));
      if (n !== null) total += n;
    }
    lastScanAt = Date.now();
    return total;
  } finally {
    setState(() => ({ scanning: false }));
  }
}

/** Rescan every source. `fromForeground` skips it if we scanned in the last minute. */
export async function rescanAll(opts?: { fromForeground?: boolean }) {
  if (getState().scanning || !getState().fullyLoaded) return 0;
  if (opts?.fromForeground && Date.now() - lastScanAt < FOREGROUND_RESCAN_MS) return 0;
  return runScan(getState().sources);
}

/** Pick a folder (e.g. Download/Instagram). Access persists, and new files show up on rescan. */
export async function addFolder(): Promise<number | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
  if (!dir?.uri) return null;
  const existing = getState().sources.find((s) => s.uri === dir.uri);
  const source: Source = existing ?? {
    id: `folder:${dir.uri}`,
    kind: 'folder',
    uri: dir.uri,
    name: nameFromUri(dir.uri) || 'Folder',
  };
  if (!existing) setState((s) => ({ sources: [...s.sources, source] }));
  lastScanAt = Date.now(); // returning from the picker shouldn't trigger a second full scan
  return runScan([source]);
}

/** Pick individual video files. */
export async function addFiles(): Promise<number | null> {
  const res = await File.pickFileAsync({ multipleFiles: true, mimeTypes: 'video/*' }).catch(() => null);
  if (!res || res.canceled) return null;
  const known = new Set(getState().sources.map((s) => s.uri));
  const added: Source[] = res.result
    .filter((f) => !known.has(f.uri))
    .map((f) => ({ id: `file:${f.uri}`, kind: 'file' as const, uri: f.uri, name: f.name }));
  setState((s) => ({
    sources: [...s.sources, ...added],
    hidden: s.hidden.filter((h) => !res.result.some((f) => f.uri === h)),
  }));
  lastScanAt = Date.now();
  const picked = new Set(res.result.map((f) => f.uri));
  return runScan(getState().sources.filter((s) => picked.has(s.uri)));
}

/** Try to delete the actual file from the phone. Returns false if the system refused. */
export function deleteFromDevice(uri: string) {
  try {
    new File(uri).delete();
    return true;
  } catch {
    return false;
  }
}
