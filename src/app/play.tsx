import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddToCollectionSheet } from '@/components/CollectionSheets';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { ReelItem } from '@/components/ReelItem';
import { ReelMenu } from '@/components/ReelMenu';
import { useFeedIds } from '@/lib/feed';
import { folderName } from '@/lib/folders';
import { updateSettings, useLibrary, type FeedOrder } from '@/store/library';
import { colors, EASE_OUT, fonts, radius, space } from '@/theme';

const ORDER_NEXT: Record<FeedOrder, FeedOrder> = {
  newest: 'unwatched',
  unwatched: 'shuffle',
  shuffle: 'oldest',
  oldest: 'newest',
};
const ORDER_ICON: Record<FeedOrder, keyof typeof Ionicons.glyphMap> = {
  newest: 'arrow-down',
  unwatched: 'sparkles-outline',
  shuffle: 'shuffle',
  oldest: 'arrow-up',
};
const ORDER_LABEL: Record<FeedOrder, string> = {
  newest: 'Newest',
  unwatched: 'Unseen first',
  shuffle: 'Shuffle',
  oldest: 'Oldest',
};

export default function Feed() {
  const insets = useSafeAreaInsets();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const hydrated = useLibrary((s) => s.hydrated);
  const order = useLibrary((s) => s.settings.order);
  const feedCollection = useLibrary((s) => s.settings.feedCollection);
  const feedFolders = useLibrary((s) => s.settings.feedFolders);
  const collectionName = useLibrary((s) => s.collections.find((c) => c.id === s.settings.feedCollection)?.name);
  const { ids, reshuffle } = useFeedIds();
  const [collectId, setCollectId] = useState<string | null>(null);
  const sourceLabel =
    collectionName ??
    (feedFolders?.length
      ? feedFolders.length === 1
        ? folderName(feedFolders[0])
        : `${folderName(feedFolders[0])} + ${feedFolders.length - 1}`
      : 'Everything');

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);
  const listRef = useRef<FlatList<string>>(null);
  const activeId = ids[active];

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      return () => {
        setFocused(false);
        if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('visible').catch(() => {});
      };
    }, []),
  );

  // Keep the current video in view when the order/filter changes underneath us.
  const [prevIds, setPrevIds] = useState(ids);
  if (prevIds !== ids) {
    setPrevIds(ids);
    const prevId = prevIds[active];
    let next = prevId ? ids.indexOf(prevId) : 0;
    if (next < 0) next = Math.min(active, Math.max(0, ids.length - 1));
    if (next !== active) setActive(next);
  }

  // Opened from the library on a specific video. Runs after the block above so it wins.
  const [handledStart, setHandledStart] = useState<string | undefined>(undefined);
  if (start !== handledStart && (!start || ids.length > 0)) {
    setHandledStart(start);
    const index = start ? ids.indexOf(start) : -1;
    if (index >= 0) setActive(index);
  }

  // Bring the list to `active` whenever it was changed by something other than a swipe.
  const offsetRef = useRef(0);
  const animateNextScroll = useRef(false);
  useEffect(() => {
    if (!size.height) return;
    const target = active * size.height;
    if (Math.abs(offsetRef.current - target) > 1) {
      listRef.current?.scrollToOffset({ offset: target, animated: animateNextScroll.current });
      offsetRef.current = target;
    }
    animateNextScroll.current = false;
  }, [active, size.height, ids]);

  // "Play next" mode: a finished reel slides on to the next one.
  const onEnded = (id: string) => {
    const i = ids.indexOf(id);
    if (i === active && i < ids.length - 1) {
      animateNextScroll.current = true;
      setActive(i + 1);
    }
  };

  // Holding for 2× hides the top bar too, so only the video and the speed badge remain.
  const topBarOpacity = useSharedValue(1);
  const topBarStyle = useAnimatedStyle(() => ({ opacity: topBarOpacity.get() }));
  // While holding, the feed must not scroll: sliding down locks the speed instead.
  const [holdingNow, setHoldingNow] = useState(false);
  const onHoldChange = (h: boolean) => {
    setHoldingNow(h);
    topBarOpacity.set(withTiming(h ? 0 : 1, { duration: h ? 140 : 180, easing: EASE_OUT }));
  };

  useEffect(() => {
    if (start) router.setParams({ start: undefined });
  }, [start]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const cycleOrder = () => {
    const next = ORDER_NEXT[order];
    if (next === 'shuffle') reshuffle();
    updateSettings({ order: next });
  };

  if (!hydrated) return <View style={styles.root} />;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {ids.length === 0 ? (
        <EmptyState filtered={feedCollection ? 'collection' : feedFolders ? 'folders' : null} />
      ) : size.height > 0 ? (
        <FlatList
          ref={listRef}
          data={ids}
          keyExtractor={(id) => id}
          renderItem={({ item, index }) => (
            <ReelItem
              id={item}
              width={size.width}
              height={size.height}
              isActive={index === active}
              shouldMount={Math.abs(index - active) <= 1}
              screenFocused={focused && appActive && menuId === null && collectId === null}
              topInset={insets.top}
              bottomInset={insets.bottom}
              onOpenMenu={setMenuId}
              onAddToCollection={setCollectId}
              onEnded={onEnded}
              onHoldChange={onHoldChange}
            />
          )}
          extraData={`${active}|${focused}|${appActive}|${menuId}|${collectId}|${size.height}`}
          scrollEnabled={!holdingNow}
          pagingEnabled
          snapToInterval={size.height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: size.height, offset: size.height * index, index })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews
          onMomentumScrollEnd={(e) => {
            offsetRef.current = e.nativeEvent.contentOffset.y;
            const i = Math.round(e.nativeEvent.contentOffset.y / size.height);
            if (i !== active) setActive(Math.max(0, Math.min(ids.length - 1, i)));
          }}
        />
      ) : null}

      <Animated.View
        pointerEvents="box-none"
        style={[styles.topBar, { paddingTop: insets.top + space.sm }, topBarStyle]}>
        <PressableScale style={styles.back} onPress={() => router.back()} accessibilityLabel="Back to home">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={styles.sourceLabel} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </PressableScale>
        {ids.length > 0 && (
          <PressableScale style={styles.chip} onPress={cycleOrder} accessibilityLabel={`Order: ${ORDER_LABEL[order]}`}>
            <Ionicons name={ORDER_ICON[order]} size={15} color={colors.text} />
            <Text style={styles.chipText}>{ORDER_LABEL[order]}</Text>
          </PressableScale>
        )}
      </Animated.View>

      {focused && activeId && <StayAwake />}
      <ReelMenu id={menuId} onClose={() => setMenuId(null)} onAddToCollection={setCollectId} />
      <AddToCollectionSheet videoId={collectId} onClose={() => setCollectId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, flexShrink: 1, marginRight: space.sm },
  sourceLabel: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    minWidth: 36,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(23,21,19,0.55)',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});

function StayAwake() {
  useKeepAwake('wellspring-feed');
  return null;
}
