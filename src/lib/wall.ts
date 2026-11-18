import type { Folder } from '@/lib/folders';

export type WallBlock = { folder: Folder; x: number; y: number; w: number; h: number; size: 'hero' | 'large' | 'small' };
export type WallRow = { key: string; height: number; blocks: WallBlock[] };

const GAP = 4;

/**
 * Lays folders out as a mosaic: area follows the square root of the video count, so a
 * 6,000-reel folder dominates without crushing a 40-reel one. Rows cycle through
 * three rhythms (feature + stack, pair, trio) so the wall never reads as a uniform grid.
 */
export function buildWall(folders: Folder[], width: number): WallRow[] {
  const rows: WallRow[] = [];
  const weight = (f: Folder) => Math.sqrt(f.count);
  let i = 0;
  let rhythm = 0;

  while (i < folders.length) {
    const left = folders.length - i;

    // Feature row: one big block, two stacked beside it.
    if (rhythm % 3 === 0 && left >= 3) {
      const [a, b, c] = folders.slice(i, i + 3);
      const share = Math.min(0.68, Math.max(0.52, weight(a) / (weight(a) + Math.max(weight(b), weight(c)))));
      const H = Math.round(width * 0.78);
      const bw = Math.round((width - GAP) * share);
      const sw = width - GAP - bw;
      const bh = Math.round((H - GAP) * (weight(b) / (weight(b) + weight(c))));
      const top = Math.min(H - GAP - 90, Math.max(90, bh));
      rows.push({
        key: `r${rows.length}`,
        height: H,
        blocks: [
          { folder: a, x: 0, y: 0, w: bw, h: H, size: rows.length === 0 ? 'hero' : 'large' },
          { folder: b, x: bw + GAP, y: 0, w: sw, h: top, size: 'small' },
          { folder: c, x: bw + GAP, y: top + GAP, w: sw, h: H - top - GAP, size: 'small' },
        ],
      });
      i += 3;
      rhythm++;
      continue;
    }

    const n = rhythm % 3 === 1 || left === 2 ? Math.min(2, left) : Math.min(3, left);
    const part = folders.slice(i, i + n);
    const total = part.reduce((sum, f) => sum + weight(f), 0);
    const H = n === 1 ? Math.round(width * 0.5) : n === 2 ? Math.round(width * 0.62) : Math.round(width * 0.5);
    const usable = width - GAP * (n - 1);
    const minW = usable * 0.26;
    // proportional widths, clamped so no block becomes a sliver
    let widths = part.map((f) => Math.max(minW, (usable * weight(f)) / total));
    const scale = usable / widths.reduce((a, b) => a + b, 0);
    widths = widths.map((w) => Math.round(w * scale));
    widths[widths.length - 1] = usable - widths.slice(0, -1).reduce((a, b) => a + b, 0);

    let x = 0;
    rows.push({
      key: `r${rows.length}`,
      height: H,
      blocks: part.map((f, k) => {
        const b: WallBlock = { folder: f, x, y: 0, w: widths[k], h: H, size: n === 1 ? 'large' : 'small' };
        x += widths[k] + GAP;
        return b;
      }),
    });
    i += n;
    rhythm++;
  }
  return rows;
}

export const WALL_GAP = GAP;
