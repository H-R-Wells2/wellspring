import { useMemo, useState } from 'react';

import { getState, useLibrary, type FeedOrder } from '@/store/library';

function shuffle<T>(arr: T[], seed: number) {
  const a = arr.slice();
  let s = seed || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeIds(
  order: FeedOrder,
  folders: string[] | null,
  collectionId: string | null,
  seed: number,
  watched: Set<string>,
) {
  const { videos, collections } = getState();
  const collection = collectionId ? collections.find((c) => c.id === collectionId) : undefined;
  if (collection) {
    // A collection plays in the order you built it (newest added first), or shuffled.
    const ids = collection.ids.filter((id) => videos[id]);
    return order === 'shuffle' ? shuffle(ids, seed) : ids;
  }
  let list = Object.values(videos);
  if (folders?.length) {
    const set = new Set(folders);
    list = list.filter((v) => v.folder && set.has(v.folder));
  }
  list.sort((a, b) => b.mtime - a.mtime);
  if (order === 'oldest') list.reverse();
  if (order === 'shuffle') return shuffle(list, seed).map((v) => v.id);
  if (order === 'unwatched') {
    return [...list.filter((v) => !watched.has(v.id)), ...list.filter((v) => watched.has(v.id))].map((v) => v.id);
  }
  return list.map((v) => v.id);
}

/**
 * Ordered video ids for the feed. Recomputed only when the list's membership or ordering
 * changes (`listVersion`), never when a resume point or thumbnail updates, which matters
 * with thousands of videos.
 */
export function useFeedIds() {
  const listVersion = useLibrary((s) => s.listVersion);
  const order = useLibrary((s) => s.settings.order);
  const folders = useLibrary((s) => s.settings.feedFolders);
  const collectionId = useLibrary((s) => s.settings.feedCollection);
  const fullyLoaded = useLibrary((s) => s.fullyLoaded);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  // "Unseen first" uses a snapshot taken when the order is chosen, so finishing a reel
  // doesn't yank it to the end of the feed while you're watching.
  const snapKey = `${order}|${seed}|${fullyLoaded}`;
  const [snap, setSnap] = useState<{ key: string; watched: Set<string> } | null>(null);
  if (!snap || snap.key !== snapKey) {
    const watched = new Set(Object.values(getState().videos).filter((v) => v.watched).map((v) => v.id));
    setSnap({ key: snapKey, watched });
  }
  const watched = snap?.watched;

  const ids = useMemo(
    () => (watched ? computeIds(order, folders, collectionId, seed, watched) : []),
    // listVersion is the trigger; the data itself is read from the store
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVersion, order, folders, collectionId, seed, watched],
  );

  // Same contents → same array, so the feed doesn't re-render when e.g. "watched" flips.
  const [stable, setStable] = useState(ids);
  if (stable !== ids && !sameIds(stable, ids)) setStable(ids);

  return { ids: sameIds(stable, ids) ? stable : ids, reshuffle: () => setSeed(Math.floor(Math.random() * 1e9)) };
}

function sameIds(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
