import { useMemo } from 'react';

import { getState, useLibrary } from '@/store/library';

export type Folder = {
  id: string; // directory URI, or 'picked'
  name: string;
  count: number;
  /** Newest few videos, used as the block's posters. */
  coverIds: string[];
  latest: number;
};

export const PICKED_FOLDER = 'picked';

/** "Instagram" from content://…/tree/primary%3ADownload%2FInstagram/document/… */
export function folderName(uri: string) {
  if (uri === PICKED_FOLDER) return 'Picked videos';
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri.replace(/\/$/, ''));
  } catch {}
  return decoded.split(/[/:]/).filter(Boolean).pop() || 'Folder';
}

/**
 * Folders that actually contain videos, biggest first. Recomputed only when the list changes
 * (listVersion), one pass over the library: ~10 ms at 10,000 videos.
 */
export function useFolders(): { folders: Folder[]; total: number } {
  const listVersion = useLibrary((s) => s.listVersion);
  return useMemo(() => {
    const map = new Map<string, Folder>();
    const videos = Object.values(getState().videos).sort((a, b) => b.mtime - a.mtime);
    for (const v of videos) {
      const id = v.folder ?? PICKED_FOLDER;
      let f = map.get(id);
      if (!f) {
        f = { id, name: folderName(id), count: 0, coverIds: [], latest: v.mtime };
        map.set(id, f);
      }
      f.count++;
      if (f.coverIds.length < 4) f.coverIds.push(v.id);
    }
    const folders = [...map.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
    return { folders, total: videos.length };
    // listVersion is the trigger; data is read from the store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listVersion]);
}
