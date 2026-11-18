import * as SQLite from 'expo-sqlite';

import type { Collection, Settings, Source, Video } from '@/store/library';

/*
 * Storage layer. SQLite is the source of truth on disk; the store keeps an in-memory
 * copy for rendering. Writes are incremental (only rows that changed), batched into one
 * transaction per flush, and run on SQLite's own thread, so a 10,000+ library never
 * rewrites itself when you save a reel or a resume point changes.
 */

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY NOT NULL,
  uri TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  mtime REAL NOT NULL DEFAULT 0,
  source_id TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  duration REAL,
  thumb TEXT,
  width INTEGER,
  height INTEGER,
  fit TEXT,
  watched INTEGER NOT NULL DEFAULT 0,
  ab_a REAL,
  ab_b REAL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_by_time ON videos (hidden, mtime DESC);
CREATE INDEX IF NOT EXISTS videos_by_fav ON videos (hidden, favorite, mtime DESC);
CREATE INDEX IF NOT EXISTS videos_by_seen ON videos (hidden, watched, mtime DESC);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, uri TEXT NOT NULL, name TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at REAL NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (collection_id, video_id)
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  dbPromise ??= open();
  return dbPromise;
}

async function open() {
  const db = await SQLite.openDatabaseAsync('wellspring.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(SCHEMA_V1 + 'PRAGMA user_version = 1;');
    version = 1;
  }
  if (version < 2) {
    // v2: parent folder per video, for the home wall and folder playback.
    await db.execAsync(
      'ALTER TABLE videos ADD COLUMN folder TEXT; CREATE INDEX IF NOT EXISTS videos_by_folder ON videos (hidden, folder, mtime DESC); PRAGMA user_version = 2;',
    );
  }
  return db;
}

// ---------- row mapping ----------

export type VideoRow = {
  id: string;
  uri: string;
  name: string;
  size: number;
  mtime: number;
  source_id: string;
  favorite: number;
  position: number;
  duration: number | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  fit: string | null;
  watched: number;
  ab_a: number | null;
  ab_b: number | null;
  hidden: number;
  folder: string | null;
};

const COLS = [
  'id',
  'uri',
  'name',
  'size',
  'mtime',
  'source_id',
  'favorite',
  'position',
  'duration',
  'thumb',
  'width',
  'height',
  'fit',
  'watched',
  'ab_a',
  'ab_b',
  'hidden',
  'folder',
] as const;

export function rowToVideo(r: VideoRow): Video {
  const v: Video = {
    id: r.id,
    uri: r.uri,
    name: r.name,
    size: r.size,
    mtime: r.mtime,
    sourceId: r.source_id,
    favorite: !!r.favorite,
    position: r.position,
  };
  if (r.duration != null) v.duration = r.duration;
  if (r.thumb) v.thumb = r.thumb;
  if (r.width != null) v.width = r.width;
  if (r.height != null) v.height = r.height;
  if (r.fit === 'fill' || r.fit === 'fit') v.fit = r.fit;
  if (r.watched) v.watched = true;
  if (r.ab_a != null && r.ab_b != null) v.ab = [r.ab_a, r.ab_b];
  if (r.folder) v.folder = r.folder;
  return v;
}

function videoParams(v: Video): (string | number | null)[] {
  return [
    v.id,
    v.uri,
    v.name,
    v.size,
    v.mtime,
    v.sourceId,
    v.favorite ? 1 : 0,
    v.position,
    v.duration ?? null,
    v.thumb ?? null,
    v.width ?? null,
    v.height ?? null,
    v.fit ?? null,
    v.watched ? 1 : 0,
    v.ab?.[0] ?? null,
    v.ab?.[1] ?? null,
    0,
    v.folder ?? null,
  ];
}

// SQLite allows up to 32,766 bound params; 18 cols × 400 rows stays well under.
const UPSERT_CHUNK = 400;
const ID_CHUNK = 900;

function chunks<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- writes ----------

export type WriteBatch = {
  upserts: Video[];
  deletes: string[];
  hide: string[];
  unhide: string[];
  sources?: Source[];
  collections?: Collection[];
  settings?: Settings;
  /** Wipe everything first (reset library). */
  reset?: boolean;
};

let writeChain: Promise<void> = Promise.resolve();

/** Serialized: one transaction at a time, in order. */
export function writeBatch(batch: WriteBatch) {
  writeChain = writeChain.then(() => runBatch(batch)).catch((e) => console.warn('[db] write failed', e));
  return writeChain;
}

async function runBatch(b: WriteBatch) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (b.reset) {
      await db.execAsync('DELETE FROM videos; DELETE FROM sources; DELETE FROM collections; DELETE FROM collection_items;');
    }
    for (const part of chunks(b.upserts, UPSERT_CHUNK)) {
      const row = `(${COLS.map(() => '?').join(',')})`;
      await db.runAsync(
        `INSERT OR REPLACE INTO videos (${COLS.join(',')}) VALUES ${part.map(() => row).join(',')}`,
        part.flatMap(videoParams),
      );
    }
    for (const part of chunks(b.deletes, ID_CHUNK)) {
      await db.runAsync(`DELETE FROM videos WHERE id IN (${part.map(() => '?').join(',')})`, part);
    }
    for (const part of chunks(b.hide, ID_CHUNK)) {
      // A hidden file keeps a row so rescans skip it even before it was ever saved.
      await db.runAsync(
        `INSERT OR IGNORE INTO videos (id, uri) VALUES ${part.map(() => '(?, ?)').join(',')}`,
        part.flatMap((id) => [id, id]),
      );
      await db.runAsync(`UPDATE videos SET hidden = 1 WHERE id IN (${part.map(() => '?').join(',')})`, part);
    }
    for (const part of chunks(b.unhide, ID_CHUNK)) {
      await db.runAsync(`UPDATE videos SET hidden = 0 WHERE id IN (${part.map(() => '?').join(',')})`, part);
    }
    if (b.sources) {
      await db.runAsync('DELETE FROM sources');
      for (const [i, s] of b.sources.entries()) {
        await db.runAsync('INSERT INTO sources (id, kind, uri, name, ord) VALUES (?, ?, ?, ?, ?)', [s.id, s.kind, s.uri, s.name, i]);
      }
    }
    if (b.collections) {
      await db.runAsync('DELETE FROM collections');
      await db.runAsync('DELETE FROM collection_items');
      for (const [i, c] of b.collections.entries()) {
        await db.runAsync('INSERT INTO collections (id, name, created_at, ord) VALUES (?, ?, ?, ?)', [c.id, c.name, c.createdAt, i]);
        for (const part of chunks(c.ids, 300)) {
          const base = c.ids.indexOf(part[0]);
          await db.runAsync(
            `INSERT OR IGNORE INTO collection_items (collection_id, video_id, ord) VALUES ${part.map(() => '(?, ?, ?)').join(',')}`,
            part.flatMap((id, j) => [c.id, id, base + j]),
          );
        }
      }
    }
    if (b.settings) {
      await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', ['settings', JSON.stringify(b.settings)]);
    }
  });
}

// ---------- reads ----------

export async function readMeta() {
  const db = await getDb();
  const [settingsRow, sources, cols, items] = await Promise.all([
    db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = 'settings'"),
    db.getAllAsync<Source & { ord: number }>('SELECT id, kind, uri, name FROM sources ORDER BY ord'),
    db.getAllAsync<{ id: string; name: string; created_at: number }>('SELECT id, name, created_at FROM collections ORDER BY ord'),
    db.getAllAsync<{ collection_id: string; video_id: string }>(
      'SELECT collection_id, video_id FROM collection_items ORDER BY collection_id, ord',
    ),
  ]);
  const byCol = new Map<string, string[]>();
  for (const it of items) {
    if (!byCol.has(it.collection_id)) byCol.set(it.collection_id, []);
    byCol.get(it.collection_id)!.push(it.video_id);
  }
  const collections: Collection[] = cols.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.created_at,
    ids: byCol.get(c.id) ?? [],
  }));
  let settings: Partial<Settings> | null = null;
  try {
    settings = settingsRow ? JSON.parse(settingsRow.value) : null;
  } catch {}
  return { settings, sources: sources.map(({ id, kind, uri, name }) => ({ id, kind, uri, name })), collections };
}

/** The first screenful in the order the feed will show it, so the first frame doesn't wait for 10,000 rows. */
export async function readBootPage(settings: Settings, limit = 24) {
  const db = await getDb();
  if (settings.feedCollection) {
    const rows = await db.getAllAsync<VideoRow>(
      `SELECT v.* FROM collection_items ci JOIN videos v ON v.id = ci.video_id
       WHERE ci.collection_id = ? AND v.hidden = 0 ORDER BY ci.ord LIMIT ?`,
      [settings.feedCollection, limit],
    );
    return rows.map(rowToVideo);
  }
  const folders = settings.feedFolders ?? [];
  const where = folders.length ? `hidden = 0 AND folder IN (${folders.map(() => '?').join(',')})` : 'hidden = 0';
  const order =
    settings.order === 'oldest'
      ? 'mtime ASC'
      : settings.order === 'unwatched'
        ? 'watched ASC, mtime DESC'
        : settings.order === 'shuffle'
          ? 'random()'
          : 'mtime DESC';
  const rows = await db.getAllAsync<VideoRow>(`SELECT * FROM videos WHERE ${where} ORDER BY ${order} LIMIT ?`, [
    ...folders,
    limit,
  ]);
  return rows.map(rowToVideo);
}

export async function readAll() {
  const db = await getDb();
  const [rows, hidden, count] = await Promise.all([
    db.getAllAsync<VideoRow>('SELECT * FROM videos WHERE hidden = 0'),
    db.getAllAsync<{ id: string }>('SELECT id FROM videos WHERE hidden = 1'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM videos'),
  ]);
  const videos: Record<string, Video> = {};
  for (const r of rows) videos[r.id] = rowToVideo(r);
  return { videos, hidden: hidden.map((h) => h.id), isEmpty: (count?.n ?? 0) === 0 };
}
