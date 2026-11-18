import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type FlatListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { AddToCollectionSheet } from '@/components/CollectionSheets';
import { ReelMenu } from '@/components/ReelMenu';
import { addFiles, addFolder, rescanAll } from '@/lib/sources';
import { ensureThumb } from '@/lib/thumbs';
import { deleteCollection, getState, setFeedSource, useLibrary } from '@/store/library';
import { colors, fonts, formatTime, radius, space } from '@/theme';

const COLS = 3;
const GAP = 2;

export default function Library() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listVersion = useLibrary((s) => s.listVersion);
  const scanning = useLibrary((s) => s.scanning);
  const scanFound = useLibrary((s) => s.scanFound);
  const [filter, setFilter] = useState<string>('all'); // 'all' | 'unseen' | collection id
  const collections = useLibrary((s) => s.collections);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query); // typing stays instant over thousands of names
  const [menuId, setMenuId] = useState<string | null>(null);

  // Ids only; each tile subscribes to its own video, so a new thumbnail re-renders one tile, not 5,000.
  const { ids, total, unseenCount } = useMemo(() => {
    const { videos, collections: cols } = getState();
    const all = Object.values(videos).sort((a, b) => b.mtime - a.mtime);
    let l = all;
    const col = cols.find((c) => c.id === filter);
    if (col) l = col.ids.map((id) => videos[id]).filter(Boolean);
    if (filter === 'unseen') l = l.filter((v) => !v.watched);
    const q = deferredQuery.trim().toLowerCase();
    if (q) l = l.filter((v) => v.name.toLowerCase().includes(q));
    return {
      ids: l.map((v) => v.id),
      total: all.length,
      unseenCount: all.filter((v) => !v.watched).length,
    };
    // listVersion is the trigger; data is read from the store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listVersion, filter, deferredQuery, collections]);

  const tileW = (width - GAP * (COLS - 1)) / COLS;
  const tileH = tileW * (16 / 9);

  const onViewable = useCallback<NonNullable<FlatListProps<string>['onViewableItemsChanged']>>(({ viewableItems }) => {
    viewableItems.forEach((t) => t.item && ensureThumb(t.item));
  }, []);

  const open = useCallback(
    (id: string) => {
      // Play from what you were browsing: everything or that collection.
      const isCollection = getState().collections.some((c) => c.id === filter);
      setFeedSource({ collection: isCollection ? filter : null });
      router.push({ pathname: '/play', params: { start: id } });
    },
    [filter],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <PressableScale style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </PressableScale>
        <Text style={styles.title}>Library</Text>
        <View style={styles.headerRight}>
          <PressableScale style={styles.iconBtn} onPress={addFolder} accessibilityLabel="Add folder">
            <Ionicons name="folder-open-outline" size={21} color={colors.text} />
          </PressableScale>
          <PressableScale style={styles.iconBtn} onPress={addFiles} accessibilityLabel="Add videos">
            <Ionicons name="add" size={25} color={colors.text} />
          </PressableScale>
          <PressableScale style={styles.iconBtn} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
            <Ionicons name="options-outline" size={22} color={colors.text} />
          </PressableScale>
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.segment}>
          <Segment label={`All ${total}`} on={filter === 'all'} onPress={() => setFilter('all')} />
          <Segment label={`New ${unseenCount}`} on={filter === 'unseen'} onPress={() => setFilter('unseen')} />
        </View>
      </View>

      {collections.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.colScroll}
          contentContainerStyle={styles.colRow}>
          {collections.map((c) => {
            const on = filter === c.id;
            return (
              <PressableScale
                key={c.id}
                scaleTo={0.96}
                style={[styles.colChip, on && styles.colChipOn]}
                onPress={() => setFilter(on ? 'all' : c.id)}
                onLongPress={() =>
                  Alert.alert(`Delete "${c.name}"?`, 'The videos stay in your library.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        if (filter === c.id) setFilter('all');
                        deleteCollection(c.id);
                      },
                    },
                  ])
                }>
                <Ionicons name="albums-outline" size={14} color={on ? colors.accentInk : colors.textDim} />
                <Text style={[styles.colText, on && { color: colors.accentInk }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={[styles.colCount, on && { color: colors.accentInk }]}>{c.ids.length}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by file name"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <PressableScale onPress={() => setQuery('')} accessibilityLabel="Clear search" style={styles.clear}>
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </PressableScale>
        )}
      </View>

      {scanning && scanFound > 0 && (
        <Text style={styles.scanNote}>Scanning… {scanFound.toLocaleString()} videos found</Text>
      )}

      <FlatList
        data={ids}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(id) => id}
        getItemLayout={(_, index) => ({ length: tileH + GAP, offset: (tileH + GAP) * index, index })}
        initialNumToRender={15}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + space.xl }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={scanning}
            onRefresh={() => void rescanAll()}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }
        renderItem={({ item }) => <Tile id={item} w={tileW} h={tileH} onOpen={open} onMenu={setMenuId} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {query
                ? `Nothing matches "${query}".`
                : filter === 'unseen'
                    ? "You've seen everything. Nice."
                    : 'No videos yet. Add a folder to get started.'}
            </Text>
          </View>
        }
      />
      <ReelMenu id={menuId} onClose={() => setMenuId(null)} onAddToCollection={setCollectId} inFeed={false} />
      <AddToCollectionSheet videoId={collectId} onClose={() => setCollectId(null)} />
    </View>
  );
}

function Segment({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.96} style={[styles.seg, on && styles.segOn]}>
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </PressableScale>
  );
}

const Tile = memo(function Tile({
  id,
  w,
  h,
  onOpen,
  onMenu,
}: {
  id: string;
  w: number;
  h: number;
  onOpen: (id: string) => void;
  onMenu: (id: string) => void;
}) {
  const video = useLibrary((s) => s.videos[id]);
  if (!video) return <View style={{ width: w, height: h }} />;
  return (
    <PressableScale
      onPress={() => onOpen(id)}
      onLongPress={() => onMenu(id)}
      delayLongPress={350}
      scaleTo={0.97}
      style={{ width: w, height: h, backgroundColor: colors.surface }}>
      {video.thumb ? (
        <Image source={video.thumb} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={video.id} transition={120} />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Ionicons name="film-outline" size={22} color={colors.textFaint} />
        </View>
      )}
      {!video.watched && <View style={styles.newDot} />}
      <View style={styles.tileFoot}>
        {video.position > 2 && video.duration ? (
          <View style={styles.resumeTrack}>
            <View style={[styles.resumeFill, { width: `${Math.min(100, (video.position / video.duration) * 100)}%` }]} />
          </View>
        ) : null}
        <View style={styles.tileMeta}>
          {video.duration ? <Text style={styles.tileTime}>{formatTime(video.duration)}</Text> : <View />}
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
  },
  title: { flex: 1, marginLeft: space.xs, fontFamily: fonts.heavy, fontSize: 22, letterSpacing: -0.6, color: colors.text },
  headerRight: { flexDirection: 'row' },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  seg: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: radius.pill },
  segOn: { backgroundColor: colors.text },
  segText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textDim, fontVariant: ['tabular-nums'] },
  segTextOn: { color: colors.bg },
  colScroll: { flexGrow: 0, marginBottom: space.md },
  colRow: { paddingHorizontal: space.lg, gap: space.sm },
  colChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  colChipOn: { backgroundColor: colors.accent },
  colText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, flexShrink: 1 },
  colCount: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  scanNote: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  search: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, paddingVertical: 0 },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  newDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  tilePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileFoot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tileMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingBottom: 6,
  },
  tileTime: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 6,
  },
  resumeTrack: { height: 2, marginHorizontal: 7, marginBottom: 5, backgroundColor: 'rgba(244,239,231,0.25)' },
  resumeFill: { height: 2, backgroundColor: colors.accent },
  empty: { paddingTop: 80, paddingHorizontal: space.xxl, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textDim, textAlign: 'center' },
});
