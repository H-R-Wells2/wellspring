import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { FolderBlock } from '@/components/FolderBlock';
import { PressableScale } from '@/components/PressableScale';
import { Wordmark } from '@/components/Wordmark';
import { useFolders } from '@/lib/folders';
import { rescanAll } from '@/lib/sources';
import { ensureThumb } from '@/lib/thumbs';
import { buildWall, WALL_GAP, type WallRow } from '@/lib/wall';
import { getState, setFeedSource, setShuffle, useLibrary } from '@/store/library';
import { colors, fonts, radius, space } from '@/theme';

const SIDE = 12;
const DOCK_H = 64;

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hydrated = useLibrary((s) => s.hydrated);
  const scanning = useLibrary((s) => s.scanning);
  const scanFound = useLibrary((s) => s.scanFound);
  const hasSources = useLibrary((s) => s.sources.length > 0);
  const collections = useLibrary((s) => s.collections);
  const shuffle = useLibrary((s) => s.settings.order === 'shuffle');
  const { folders, total } = useFolders();
  const [picked, setPicked] = useState<string[]>([]);

  const wallWidth = width - SIDE * 2;
  const rows = useMemo(() => buildWall(folders, wallWidth), [folders, wallWidth]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const pickedCount = useMemo(
    () => folders.reduce((n, f) => (pickedSet.has(f.id) ? n + f.count : n), 0),
    [folders, pickedSet],
  );

  // Folders that vanished (rescan) leave the selection.
  const [prevFolders, setPrevFolders] = useState(folders);
  if (prevFolders !== folders) {
    setPrevFolders(folders);
    const alive = new Set(folders.map((f) => f.id));
    if (picked.some((p) => !alive.has(p))) setPicked(picked.filter((p) => alive.has(p)));
  }

  const toggle = useCallback((id: string) => {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);

  const playFolders = useCallback((ids: string[]) => {
    setFeedSource({ folders: ids });
    router.push('/play');
  }, []);
  const playOne = useCallback((id: string) => playFolders([id]), [playFolders]);
  const playEverything = () => {
    setFeedSource({});
    router.push('/play');
  };
  const playCollection = (id: string) => {
    setFeedSource({ collection: id });
    router.push('/play');
  };

  if (!hydrated) return <View style={styles.root} />;
  if (!hasSources && total === 0) return <EmptyState filtered={null} />;

  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Wordmark size={22} />
        <View style={styles.topActions}>
          <PressableScale style={styles.iconBtn} onPress={() => router.push('/library')} accessibilityLabel="All videos">
            <Ionicons name="grid-outline" size={20} color={colors.text} />
          </PressableScale>
          <PressableScale style={styles.iconBtn} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
            <Ionicons name="options-outline" size={22} color={colors.text} />
          </PressableScale>
        </View>
      </View>

      {scanning && (
        <View style={styles.scanRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.scanText}>
            {scanFound > 0 ? `Finding videos… ${scanFound.toLocaleString()}` : 'Looking through your folders…'}
          </Text>
        </View>
      )}

      <Spring total={total} folderCount={folders.length} shuffle={shuffle} width={wallWidth} onPlay={playEverything} />

      {collections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collections</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colRow}>
            {collections.map((c) => (
              <CollectionChip key={c.id} name={c.name} count={c.ids.length} coverId={c.ids[0]} onPress={() => playCollection(c.id)} />
            ))}
          </ScrollView>
        </View>
      )}

      {folders.length > 0 && (
        <View style={[styles.section, styles.wallHead]}>
          <Text style={styles.sectionTitle}>Folders</Text>
          <Text style={styles.hint}>Tap to mix · hold to play</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList<WallRow>
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ height: item.height, marginHorizontal: SIDE, marginBottom: WALL_GAP }}>
            {item.blocks.map((b) => (
              <FolderBlock
                key={b.folder.id}
                block={b}
                selected={pickedSet.has(b.folder.id)}
                dimmed={picked.length > 0 && !pickedSet.has(b.folder.id)}
                onToggle={toggle}
                onPlay={playOne}
              />
            ))}
          </View>
        )}
        extraData={picked}
        contentContainerStyle={{ paddingBottom: insets.bottom + DOCK_H + space.xxl }}
        initialNumToRender={4}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void rescanAll()}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surfaceRaised}
            progressViewOffset={insets.top}
          />
        }
      />

      <Dock
        count={picked.length}
        reels={pickedCount}
        shuffle={shuffle}
        bottom={insets.bottom}
        onClear={() => setPicked([])}
        onPlay={() => playFolders(picked)}
      />
    </View>
  );
}

/** "Everything": the whole library as one wide stream of its newest posters. */
function Spring({
  total,
  folderCount,
  shuffle,
  width,
  onPlay,
}: {
  total: number;
  folderCount: number;
  shuffle: boolean;
  width: number;
  onPlay: () => void;
}) {
  const listVersion = useLibrary((s) => s.listVersion);
  // The seven newest reels, re-derived only when the list itself changes.
  const ids = useMemo(
    () =>
      Object.values(getState().videos)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 7)
        .map((v) => v.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVersion],
  );
  const height = Math.round(width * 0.52);

  return (
    <PressableScale onPress={onPlay} scaleTo={0.985} style={[styles.spring, { height, marginHorizontal: SIDE }]} accessibilityLabel={`Play everything, ${total} videos`}>
      <View style={styles.springSlices}>
        {ids.map((id) => (
          <SpringSlice key={id} id={id} />
        ))}
      </View>
      <LinearGradient
        colors={['rgba(12,11,10,0.15)', 'rgba(12,11,10,0.6)', 'rgba(12,11,10,0.95)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.springBody}>
        <View style={{ flex: 1 }}>
          <Text style={styles.springTitle}>Everything</Text>
          <Text style={styles.springMeta}>
            {total.toLocaleString()} reels · {folderCount} {folderCount === 1 ? 'folder' : 'folders'}
          </Text>
        </View>
        <PressableScale
          style={[styles.roundBtn, shuffle && styles.roundOn]}
          onPress={() => {
            Haptics.selectionAsync();
            setShuffle(!shuffle);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: shuffle }}
          accessibilityLabel="Shuffle">
          <Ionicons name="shuffle" size={20} color={shuffle ? colors.accentInk : colors.text} />
        </PressableScale>
        <View style={styles.playDisc}>
          <Ionicons name="play" size={26} color={colors.accentInk} style={{ marginLeft: 3 }} />
        </View>
      </View>
    </PressableScale>
  );
}

function SpringSlice({ id }: { id: string }) {
  const thumb = useLibrary((s) => s.videos[id]?.thumb);
  useEffect(() => {
    if (!thumb) ensureThumb(id);
  }, [thumb, id]);
  return <View style={styles.springSlice}>{thumb ? <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} /> : null}</View>;
}

function CollectionChip({ name, count, coverId, onPress }: { name: string; count: number; coverId?: string; onPress: () => void }) {
  const thumb = useLibrary((s) => (coverId ? s.videos[coverId]?.thumb : undefined));
  return (
    <PressableScale style={styles.colChip} onPress={onPress} scaleTo={0.96} accessibilityLabel={`Play collection ${name}`}>
      <View style={styles.colCover}>{thumb ? <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.colName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.colCount}>{count.toLocaleString()}</Text>
      </View>
    </PressableScale>
  );
}

/** Rises when folders are picked: what will play, shuffle, and the one primary action. */
function Dock({
  count,
  reels,
  shuffle,
  bottom,
  onClear,
  onPlay,
}: {
  count: number;
  reels: number;
  shuffle: boolean;
  bottom: number;
  onClear: () => void;
  onPlay: () => void;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    const target = count > 0 ? 1 : 0;
    shown.set(reduced ? withTiming(target, { duration: 160 }) : withSpring(target, { duration: 380, dampingRatio: 0.82 }));
  }, [count, reduced, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.get() * 1.4),
    transform: [{ translateY: (1 - shown.get()) * (DOCK_H + 40) }],
  }));

  return (
    <Animated.View pointerEvents={count > 0 ? 'box-none' : 'none'} style={[styles.dockWrap, { bottom: bottom + space.md }, style]}>
      <View style={styles.dock}>
        <PressableScale style={styles.dockIcon} onPress={onClear} accessibilityLabel="Clear selection">
          <Ionicons name="close" size={20} color={colors.textDim} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={styles.dockTitle} numberOfLines={1}>
            {count} {count === 1 ? 'folder' : 'folders'}
          </Text>
          <Text style={styles.dockMeta}>{reels.toLocaleString()} reels</Text>
        </View>
        <PressableScale
          style={[styles.dockIcon, shuffle && styles.roundOn]}
          onPress={() => {
            Haptics.selectionAsync();
            setShuffle(!shuffle);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: shuffle }}
          accessibilityLabel="Shuffle">
          <Ionicons name="shuffle" size={20} color={shuffle ? colors.accentInk : colors.text} />
        </PressableScale>
        <PressableScale style={styles.dockPlay} onPress={onPlay} scaleTo={0.96} accessibilityLabel="Play selected folders">
          <Ionicons name="play" size={18} color={colors.accentInk} />
          <Text style={styles.dockPlayText}>Play</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingBottom: space.md,
  },
  topActions: { flexDirection: 'row' },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  scanText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textDim, fontVariant: ['tabular-nums'] },

  spring: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  springSlices: { ...StyleSheet.absoluteFill, flexDirection: 'row', gap: 2 },
  springSlice: { flex: 1, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  springBody: {
    position: 'absolute',
    left: space.lg,
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  springTitle: { fontFamily: fonts.heavy, fontSize: 38, lineHeight: 40, letterSpacing: -1.4, color: colors.text },
  springMeta: { marginTop: 4, fontFamily: fonts.medium, fontSize: 13.5, color: colors.textDim, fontVariant: ['tabular-nums'] },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(33,30,27,0.85)',
  },
  roundOn: { backgroundColor: colors.accent },
  playDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },

  section: { marginTop: space.xl, paddingHorizontal: space.lg },
  wallHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.md },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 21, letterSpacing: -0.5, color: colors.text },
  hint: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint },
  colRow: { gap: space.sm, paddingTop: space.md, paddingRight: space.lg },
  colChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: 6,
    paddingRight: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    maxWidth: 220,
  },
  colCover: { width: 34, height: 52, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  colName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  colCount: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },

  dockWrap: { position: 'absolute', left: SIDE, right: SIDE },
  dock: {
    height: DOCK_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: 4,
    paddingRight: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  dockIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dockTitle: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.text },
  dockMeta: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textDim, fontVariant: ['tabular-nums'] },
  dockPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  dockPlayText: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.accentInk },
});
