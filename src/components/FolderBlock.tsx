import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { ensureThumb } from '@/lib/thumbs';
import type { WallBlock } from '@/lib/wall';
import { useLibrary } from '@/store/library';
import { colors, EASE_OUT, fonts } from '@/theme';

type Props = {
  block: WallBlock;
  selected: boolean;
  /** Some other folder is selected: recede so the picks stand forward. */
  dimmed: boolean;
  onToggle: (id: string) => void;
  onPlay: (id: string) => void;
};

/**
 * One folder on the wall: its newest reels as tall slices, the name set over them.
 * Tap mixes it into the selection; hold plays it straight away.
 */
export const FolderBlock = memo(function FolderBlock({ block, selected, dimmed, onToggle, onPlay }: Props) {
  const { folder, w, h, size } = block;
  const reduced = useReducedMotion();
  // As many 9:16-ish slices as fit the block, up to the covers we have.
  const slices = Math.max(1, Math.min(folder.coverIds.length, Math.round(w / (h * 0.6))));
  const ids = folder.coverIds.slice(0, slices);

  const sel = useSharedValue(selected ? 1 : 0);
  const dim = useSharedValue(dimmed ? 1 : 0);
  useEffect(() => {
    sel.set(reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { duration: 320, dampingRatio: 0.75 }));
  }, [selected, reduced, sel]);
  useEffect(() => {
    dim.set(withTiming(dimmed ? 1 : 0, { duration: 220, easing: EASE_OUT }));
  }, [dimmed, dim]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: 1 - dim.get() * 0.5,
    transform: [{ scale: 1 - sel.get() * 0.035 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: sel.get() }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: sel.get(),
    transform: [{ scale: 0.6 + sel.get() * 0.4 }],
  }));

  const nameSize = size === 'hero' ? 30 : size === 'large' ? 24 : w < 130 ? 15 : 18;

  return (
    <Pressable
      style={{ position: 'absolute', left: block.x, top: block.y, width: w, height: h }}
      onPress={() => {
        Haptics.selectionAsync();
        onToggle(folder.id);
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPlay(folder.id);
      }}
      delayLongPress={380}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${folder.name}, ${folder.count} videos`}
      accessibilityHint="Tap to add to the mix, hold to play this folder">
      <Animated.View style={[StyleSheet.absoluteFill, styles.block, bodyStyle]}>
        <View style={styles.slices}>
          {ids.map((id) => (
            <Slice key={id} id={id} />
          ))}
        </View>
        <LinearGradient
          colors={['rgba(12,11,10,0)', 'rgba(12,11,10,0.55)', 'rgba(12,11,10,0.92)']}
          locations={[0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.label}>
          <Text style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.08 }]} numberOfLines={2}>
            {folder.name}
          </Text>
          <Text style={styles.count}>{folder.count.toLocaleString()}</Text>
        </View>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        <Animated.View pointerEvents="none" style={[styles.badge, badgeStyle]}>
          <Ionicons name="checkmark" size={16} color={colors.accentInk} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

function Slice({ id }: { id: string }) {
  const thumb = useLibrary((s) => s.videos[id]?.thumb);
  useEffect(() => {
    if (!thumb) ensureThumb(id);
  }, [thumb, id]);
  return (
    <View style={styles.slice}>
      {thumb ? <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} recyclingKey={id} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface },
  slices: { ...StyleSheet.absoluteFill, flexDirection: 'row', gap: 2 },
  slice: { flex: 1, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  label: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  name: { fontFamily: fonts.heavy, color: colors.text, letterSpacing: -0.5 },
  count: { marginTop: 2, fontFamily: fonts.medium, fontSize: 12.5, color: colors.textDim, fontVariant: ['tabular-nums'] },
  ring: { ...StyleSheet.absoluteFill, borderRadius: 6, borderWidth: 3, borderColor: colors.accent },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
