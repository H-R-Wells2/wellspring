import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { readAll, readBootPage, readMeta, writeBatch, type WriteBatch } from '@/store/db';

export type Source = {
  id: string;
  kind: 'folder' | 'file';
  uri: string;
  name: string;
};

export type Video = {
  id: string; // the content/file uri, stable per file
  uri: string;
  name: string;
  size: number;
  mtime: number;
  sourceId: string;
  favorite: boolean;
  position: number; // seconds, for resume
  duration?: number;
  thumb?: string;
  width?: number;
  height?: number;
  /** Per-video override set by pinching: 'fill' crops to the screen, 'fit' shows the whole frame. */
  fit?: 'fill' | 'fit';
  watched?: boolean;
  /** A-B repeat section in seconds, remembered per video. */
  ab?: [number, number];
  /** Parent directory URI (or 'picked' for individually chosen files). Drives the home wall. */
  folder?: string;
};

export type Collection = {
  id: string;
  name: string;
  /** Most recently added first. */
  ids: string[];
  createdAt: number;
};

export type FeedOrder = 'newest' | 'unwatched' | 'shuffle' | 'oldest';

/** How videos that aren't vertical (landscape, square, 4:5) are shown. */
export type WideMode = 'blur' | 'fit' | 'fill';

export type Settings = {
  holdSpeed: number;
  muted: boolean;
  order: FeedOrder;
  /** Order to return to when shuffle is switched off. */
  lastOrder: Exclude<FeedOrder, 'shuffle'>;
  resume: boolean;
  wideMode: WideMode;
  onEnd: 'loop' | 'next';
  /** Vertical reels: fill the screen like Reels, or show the whole frame with an ambient glow. */
  verticalMode: 'fill' | 'ambient';
  /** Live color glow behind anything that doesn't fill the screen. */
  ambient: boolean;
  /** When set, the feed plays only this collection. */
  feedCollection: string | null;
  /** When set, the feed plays only these folders (directory URIs). */
  feedFolders: string[] | null;
  /** Settings schema version, for one-time migrations. */
  v: number;
};

export type LibraryState = {
  /** The first screenful is in memory: the feed can render. */
  hydrated: boolean;
  /** Every row is in memory: scans, search and counts are complete. */
  fullyLoaded: boolean;
  scanning: boolean;
  /** Videos found so far in the running scan, for progress UI. */
  scanFound: number;
  /**
   * Bumped only when the *membership or order inputs* of the list change (add/remove/favorite),
   * so a 5,000-item feed isn't re-sorted when a resume point or thumbnail updates.
   */
  listVersion: number;
  sources: Source[];
  videos: Record<string, Video>;
  hidden: string[];
  collections: Collection[];
  settings: Settings;
  /** Session-only: the video whose A-B section is being set. */
  abEditId: string | null;
};

// Older builds kept everything in one JSON blob; it's imported once into SQLite.
const legacyFile = new File(Paths.document, 'library.json');
const LEGACY_KEY = 'reelbox/library/v1';
const PERSIST_DEBOUNCE_MS = 800;

const defaultSettings: Settings = {
  holdSpeed: 2,
  muted: false,
  order: 'newest',
  lastOrder: 'newest',
  resume: true,
  wideMode: 'blur',
  onEnd: 'loop',
  verticalMode: 'ambient', // fit the whole frame by default
  ambient: true,
  feedCollection: null,
  feedFolders: null,
  v: 2,
};

/** One-time settings migrations. v2: everything fits by default; Save is gone. */
function migrateSettings(saved: Partial<Settings> & Record<string, unknown>): Settings {
  const s = { ...defaultSettings, ...saved } as Settings & Record<string, unknown>;
  if ((saved.v ?? 1) < 2) {
    s.verticalMode = 'ambient';
    if (s.wideMode === 'fill') s.wideMode = 'blur';
    s.v = 2;
  }
  delete s.favoritesOnly;
  delete s.doubleTapSeek;
  if (s.order !== 'shuffle') s.lastOrder = s.order;
  return s;
}

let state: LibraryState = {
  hydrated: false,
  fullyLoaded: false,
  scanning: false,
  scanFound: 0,
  listVersion: 0,
  sources: [],
  videos: {},
  hidden: [],
  collections: [],
  settings: defaultSettings,
  abEditId: null,
};

/** What's already on disk. Flushing diffs the live state against this by reference. */
type Persisted = Pick<LibraryState, 'videos' | 'hidden' | 'sources' | 'collections' | 'settings'>;
let persisted: Persisted = pick(state);
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let resetPending = false;

const listeners = new Set<() => void>();

function pick(s: LibraryState): Persisted {
  return { videos: s.videos, hidden: s.hidden, sources: s.sources, collections: s.collections, settings: s.settings };
}

export function getState() {
  return state;
}

export function setState(updater: (s: LibraryState) => Partial<LibraryState>) {
  const patch = updater(state);
  if (Object.keys(patch).length === 0) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (state.hydrated && ('sources' in patch || 'videos' in patch || 'hidden' in patch || 'settings' in patch || 'collections' in patch)) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  }
}

/**
 * Write only what changed since the last flush: changed/new video rows (by object identity,
 * which our immutable updates guarantee), deletions, hide/unhide, and the small tables when
 * they changed. A resume-point update writes one row, not the whole library.
 */
export function flush() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const cur = pick(state);
  const prev = persisted;
  persisted = cur;

  const batch: WriteBatch = { upserts: [], deletes: [], hide: [], unhide: [], reset: resetPending };
  resetPending = false;
  if (cur.videos !== prev.videos) {
    for (const id in cur.videos) if (cur.videos[id] !== prev.videos[id]) batch.upserts.push(cur.videos[id]);
  }
  if (cur.hidden !== prev.hidden) {
    const was = new Set(prev.hidden);
    const now = new Set(cur.hidden);
    for (const id of now) if (!was.has(id)) batch.hide.push(id);
    for (const id of was) if (!now.has(id)) batch.unhide.push(id);
  }
  if (cur.videos !== prev.videos) {
    const hiddenNow = new Set(cur.hidden);
    for (const id in prev.videos) if (!(id in cur.videos) && !hiddenNow.has(id)) batch.deletes.push(id);
  }
  if (cur.sources !== prev.sources) batch.sources = cur.sources;
  if (cur.collections !== prev.collections) batch.collections = cur.collections;
  if (cur.settings !== prev.settings) batch.settings = cur.settings;

  const empty =
    !batch.reset &&
    !batch.upserts.length &&
    !batch.deletes.length &&
    !batch.hide.length &&
    !batch.unhide.length &&
    !batch.sources &&
    !batch.collections &&
    !batch.settings;
  return empty ? Promise.resolve() : writeBatch(batch);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe to a slice. The selector must return a stable reference (a field, not a new object). */
export function useLibrary<T>(selector: (s: LibraryState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/**
 * Two-phase start, so 10,000+ videos never delay the first frame:
 *  1. settings + sources + collections + the first ~24 videos in feed order → render.
 *  2. every row → scans/search/counts become complete (resolves the returned promise).
 */
export async function hydrate() {
  try {
    const meta = await readMeta();
    const settings = migrateSettings(meta.settings ?? {});
    const boot = await readBootPage(settings);
    const videos: Record<string, Video> = {};
    for (const v of boot) videos[v.id] = v;
    state = { ...state, settings, sources: meta.sources, collections: meta.collections, videos };
    persisted = pick(state);
    setState((s) => ({ hydrated: true, listVersion: s.listVersion + 1 }));

    const all = await readAll();
    if (all.isEmpty) {
      await importLegacy();
      return;
    }
    await flush(); // anything changed during phase 1 is on disk before we swap the map
    setState((s) => {
      // Rows touched since boot (e.g. a resume point) win over what was read.
      const merged = all.videos;
      for (const id in s.videos) if (merged[id]) merged[id] = s.videos[id];
      return { videos: merged, hidden: all.hidden, fullyLoaded: true, listVersion: s.listVersion + 1 };
    });
    persisted = pick(state);
  } catch (e) {
    console.warn('[library] hydrate failed', e);
    setState((s) => ({ hydrated: true, fullyLoaded: true, listVersion: s.listVersion + 1 }));
  }
}

/** One-time import from the JSON/AsyncStorage builds into SQLite. */
async function importLegacy() {
  let raw: string | null = null;
  try {
    if (legacyFile.exists) raw = await legacyFile.text();
    else raw = await AsyncStorage.getItem(LEGACY_KEY);
  } catch {}
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      persisted = { videos: {}, hidden: [], sources: [], collections: [], settings: defaultSettings };
      setState((s) => ({
        sources: saved.sources ?? [],
        videos: saved.videos ?? {},
        hidden: saved.hidden ?? [],
        collections: saved.collections ?? [],
        settings: migrateSettings(saved.settings ?? {}),
      }));
      await flush();
      try {
        if (legacyFile.exists) legacyFile.delete();
      } catch {}
      AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
    } catch {}
  }
  setState((s) => ({ fullyLoaded: true, listVersion: s.listVersion + 1 }));
}

// ---------- mutations ----------

export function updateVideo(id: string, patch: Partial<Video>) {
  setState((s) => {
    const v = s.videos[id];
    if (!v) return {};
    const changesList =
      ('watched' in patch && patch.watched !== v.watched) || ('folder' in patch && patch.folder !== v.folder);
    return {
      videos: { ...s.videos, [id]: { ...v, ...patch } },
      ...(changesList ? { listVersion: s.listVersion + 1 } : {}),
    };
  });
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => {
    const next = { ...s.settings, ...patch };
    if (patch.order && patch.order !== 'shuffle') next.lastOrder = patch.order;
    return { settings: next };
  });
}

/** Choose what the feed plays: everything, some folders, or a collection. */
export function setFeedSource(src: { folders?: string[] | null; collection?: string | null }) {
  updateSettings({ feedFolders: src.folders?.length ? src.folders : null, feedCollection: src.collection ?? null });
}

export function setShuffle(on: boolean) {
  const { order, lastOrder } = state.settings;
  if (on && order !== 'shuffle') updateSettings({ order: 'shuffle' });
  if (!on && order === 'shuffle') updateSettings({ order: lastOrder ?? 'newest' });
}

export function hideVideo(id: string) {
  setState((s) => {
    const videos = { ...s.videos };
    delete videos[id];
    return { videos, hidden: [...s.hidden, id], listVersion: s.listVersion + 1 };
  });
}

export function removeSource(sourceId: string) {
  setState((s) => {
    const videos: Record<string, Video> = {};
    for (const v of Object.values(s.videos)) if (v.sourceId !== sourceId) videos[v.id] = v;
    return { sources: s.sources.filter((x) => x.id !== sourceId), videos, listVersion: s.listVersion + 1 };
  });
}

export function clearLibrary() {
  resetPending = true;
  setState((s) => ({
    sources: [],
    videos: {},
    hidden: [],
    collections: [],
    settings: { ...s.settings, feedCollection: null, feedFolders: null },
    listVersion: s.listVersion + 1,
  }));
}

// ---------- collections ----------

export function createCollection(name: string, firstId?: string) {
  const c: Collection = {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Untitled',
    ids: firstId ? [firstId] : [],
    createdAt: Date.now(),
  };
  setState((s) => ({ collections: [...s.collections, c], listVersion: s.listVersion + 1 }));
  return c.id;
}

export function toggleInCollection(collectionId: string, videoId: string) {
  setState((s) => ({
    collections: s.collections.map((c) =>
      c.id !== collectionId
        ? c
        : { ...c, ids: c.ids.includes(videoId) ? c.ids.filter((x) => x !== videoId) : [videoId, ...c.ids] },
    ),
    listVersion: s.listVersion + 1,
  }));
}

export function renameCollection(collectionId: string, name: string) {
  setState((s) => ({
    collections: s.collections.map((c) => (c.id === collectionId ? { ...c, name: name.trim() || c.name } : c)),
  }));
}

export function deleteCollection(collectionId: string) {
  setState((s) => ({
    collections: s.collections.filter((c) => c.id !== collectionId),
    settings: s.settings.feedCollection === collectionId ? { ...s.settings, feedCollection: null } : s.settings,
    listVersion: s.listVersion + 1,
  }));
}
