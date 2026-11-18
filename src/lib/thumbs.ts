import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { getState, updateVideo } from '@/store/library';

/*
 * Poster frames, sized for 5,000+ videos:
 * - downscaled to 320px wide JPEGs (~20 KB each instead of ~150 KB full-frame);
 * - newest request first (LIFO) and a capped queue, so fast-scrolling the library
 *   works on what's on screen instead of a backlog of tiles you've scrolled past.
 */

// Created lazily: modules must not touch native file APIs at import time.
const getThumbDir = () => new Directory(Paths.document, 'thumbs');
const THUMB_WIDTH = 320;
const CONCURRENCY = 2;
const MAX_QUEUE = 48;

let queue: string[] = [];
const queued = new Set<string>();
const failed = new Set<string>();
let running = 0;

function hash(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Queue a poster frame for this video. Cheap to call repeatedly. */
export function ensureThumb(id: string) {
  const v = getState().videos[id];
  if (!v || v.thumb || failed.has(id)) return;
  if (queued.has(id)) {
    queue = queue.filter((q) => q !== id); // bump to the front
  } else {
    queued.add(id);
  }
  queue.push(id);
  if (queue.length > MAX_QUEUE) {
    const dropped = queue.splice(0, queue.length - MAX_QUEUE);
    dropped.forEach((d) => queued.delete(d));
  }
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.pop()!; // most recently requested = currently on screen
    running++;
    generate(id).finally(() => {
      running--;
      queued.delete(id);
      pump();
    });
  }
}

async function generate(id: string) {
  const v = getState().videos[id];
  if (!v || v.thumb) return;
  try {
    const thumbDir = getThumbDir();
    if (!thumbDir.exists) thumbDir.create({ intermediates: true });
    const frame = await VideoThumbnails.getThumbnailAsync(v.uri, { time: 800, quality: 0.9 });
    const ctx = ImageManipulator.manipulate(frame.uri).resize({ width: THUMB_WIDTH });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
    const target = new File(thumbDir, `${hash(id)}.jpg`);
    if (target.exists) target.delete();
    new File(saved.uri).moveSync(target);
    try {
      new File(frame.uri).delete();
    } catch {}
    // The frame's size already accounts for rotation metadata; use it for orientation.
    updateVideo(id, { thumb: target.uri, width: v.width ?? frame.width, height: v.height ?? frame.height });
  } catch {
    failed.add(id); // unreadable or unsupported codec: don't retry this session
  }
}
