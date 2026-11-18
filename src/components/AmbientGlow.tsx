import { Image } from 'expo-image';
import type { VideoPlayer, VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const SAMPLE_MS = 1400;
const SAMPLE_WIDTH = 64;

/**
 * TV-style ambient light: a tiny frame of what's playing right now, blurred and scaled up
 * behind the video, cross-fading every ~1.4s so the edges breathe with the scene.
 * Only samples while the reel is actually playing.
 */
export function AmbientGlow({ player, active, poster }: { player: VideoPlayer; active: boolean; poster?: string }) {
  const [frame, setFrame] = useState<VideoThumbnail | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let busy = false;
    const sample = async () => {
      if (busy) return;
      busy = true;
      try {
        const [thumb] = await player.generateThumbnailsAsync(player.currentTime, { maxWidth: SAMPLE_WIDTH });
        if (!cancelled && thumb) setFrame(thumb);
      } catch {
        // some codecs can't be sampled; the poster glow stays
      } finally {
        busy = false;
      }
    };
    sample();
    const t = setInterval(sample, SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active, player]);

  const source = frame ?? poster ?? null;
  if (!source) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={source}
        style={styles.glow}
        contentFit="cover"
        blurRadius={28}
        transition={{ duration: 900, effect: 'cross-dissolve' }}
      />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Oversized so the blur's soft edges sit off-screen.
  glow: { position: 'absolute', top: '-10%', bottom: '-10%', left: '-15%', right: '-15%' },
  dim: { backgroundColor: 'rgba(8,7,6,0.38)' },
});
