import { Directory, File, Paths } from 'expo-file-system';
import * as Legacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/*
 * Android's share sheet (WhatsApp, Telegram, Drive, other players…) through expo-sharing only
 * accepts local file:// paths, while our videos are SAF content:// documents. So we copy the
 * one video into a private cache folder, share that, and clear the folder before the next share,
 * so at most one shared copy ever sits on disk.
 */

const shareDir = new Directory(Paths.cache, 'share');

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  avi: 'video/x-msvideo',
};

function extOf(uri: string) {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {}
  const m = decoded.match(/\.([a-z0-9]{2,4})$/i);
  return (m?.[1] ?? 'mp4').toLowerCase();
}

function safeName(name: string) {
  return name.replace(/[^\p{L}\p{N} ._-]+/gu, '_').slice(0, 80) || 'video';
}

export async function shareVideo(uri: string, name: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const ext = extOf(uri);

  // Clear the previous shared copy.
  try {
    if (shareDir.exists) shareDir.delete();
  } catch {}
  shareDir.create({ intermediates: true });

  const target = new File(shareDir, `${safeName(name)}.${ext}`);
  if (uri.startsWith('file://')) {
    await new File(uri).copy(target);
  } else {
    await Legacy.copyAsync({ from: uri, to: target.uri });
  }

  await Sharing.shareAsync(target.uri, {
    mimeType: MIME[ext] ?? 'video/*',
    dialogTitle: `Share ${name}`,
  });
}
