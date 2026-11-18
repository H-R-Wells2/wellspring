import Ionicons from '@expo/vector-icons/Ionicons';
import { useEventListener } from 'expo';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useSimultaneousGestures,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

import { ABBar } from '@/components/ABBar';
import { AmbientGlow } from '@/components/AmbientGlow';
import { PressableScale } from '@/components/PressableScale';
import { ProgressBar } from '@/components/ProgressBar';
import { ensureThumb } from '@/lib/thumbs';
import { setState, updateVideo, useLibrary, getState, type Video, type WideMode } from '@/store/library';
import { colors, EASE_OUT, fonts, formatTime, radius, space } from '@/theme';

type Props = {
  id: string;
  width: number;
  height: number;
  isActive: boolean;
  shouldMount: boolean;
  screenFocused: boolean;
  topInset: number;
  bottomInset: number;
  onOpenMenu: (id: string) => void;
  onAddToCollection: (id: string) => void;
  onEnded: (id: string) => void;
  onHoldChange: (holding: boolean) => void;
};

/** Vertical-ish videos fill the screen like Reels; anything wider follows the setting or a per-video pinch. */
function useDisplayMode(video: Video | undefined, width: number, height: number): WideMode {
  const wideMode = useLibrary((s) => s.settings.wideMode);
  const verticalMode = useLibrary((s) => s.settings.verticalMode);
  if (!video) return 'fill';
  if (video.fit === 'fill') return 'fill';
  if (video.fit === 'fit') return wideMode === 'fit' ? 'fit' : 'blur';
  const known = !!(video.width && video.height);
  const tall = !known || video.height! / video.width! >= (height / width) * 0.75;
  if (tall) return verticalMode === 'ambient' ? 'blur' : 'fill';
  return wideMode;
}

export const ReelItem = memo(function ReelItem(props: Props) {
  const video = useLibrary((s) => s.videos[props.id]);

  useEffect(() => {
    if (video && !video.thumb) ensureThumb(video.id);
  }, [video]);

  const mode = useDisplayMode(video, props.width, props.height);

  if (!video) return <View style={{ width: props.width, height: props.height, backgroundColor: colors.bg }} />;

  return (
    <View style={{ width: props.width, height: props.height, backgroundColor: colors.bg }}>
      {video.thumb && mode === 'blur' && (
        <>
          <Image source={video.thumb} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={36} transition={0} />
          <View style={[StyleSheet.absoluteFill, styles.blurDim]} />
        </>
      )}
      {video.thumb && (
        <Image
          source={video.thumb}
          style={StyleSheet.absoluteFill}
          contentFit={mode === 'fill' ? 'cover' : 'contain'}
          transition={0}
        />
      )}
      {props.shouldMount ? (
        <ReelPlayer {...props} />
      ) : (
        <Chrome {...props} player={null} duration={video.duration ?? 0} />
      )}
    </View>
  );
});

function ReelPlayer(props: Props) {
  const { id, isActive, screenFocused } = props;
  const video = useLibrary((s) => s.videos[id])!;
  const muted = useLibrary((s) => s.settings.muted);
  const holdSpeed = useLibrary((s) => s.settings.holdSpeed);
  const loop = useLibrary((s) => s.settings.onEnd === 'loop');
  const ambient = useLibrary((s) => s.settings.ambient);
  const abEditing = useLibrary((s) => s.abEditId === id);
  const mode = useDisplayMode(video, props.width, props.height);
  const ab = video.ab ?? null;

  const player = useVideoPlayer(video.uri, (p) => {
    p.loop = getState().settings.onEnd === 'loop';
    p.muted = getState().settings.muted;
    // Android defaults this to false, which makes 2× sound chipmunk-y. Reels keeps the voice natural.
    p.preservesPitch = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(video.duration ?? 0);
  const [userPaused, setUserPaused] = useState(false);
  const resumed = useRef(false);
  const markedWatched = useRef(!!video.watched);
  const pinchScale = useSharedValue(1);
  const fitToast = useSharedValue(0);
  const [fitLabel, setFitLabel] = useState('');

  const progress = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const holding = useSharedValue(0); // 1 while hold-to-speed is active
  const pausedIcon = useSharedValue(0);
  const [liveSpeed, setLiveSpeed] = useState(holdSpeed);
  const holdActive = useRef(false);
  const holdBase = useRef(holdSpeed);
  const liveRef = useRef(holdSpeed);
  const [draftA, setDraftA] = useState<number | null>(null);

  // ----- player lifecycle -----
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status !== 'readyToPlay') return;
    setReady(true);
    const d = player.duration;
    if (d > 0) setDuration(d);
    const size = player.videoTrack?.size;
    const v = getState().videos[id];
    // Thumbnail dimensions already account for rotation metadata, so only fill gaps from the track.
    if (v && (v.duration !== d || (size?.width && !v.width))) {
      updateVideo(id, { duration: d, width: v.width ?? size?.width, height: v.height ?? size?.height });
    }
    if (!resumed.current) {
      resumed.current = true;
      const pos = v?.position ?? 0;
      if (getState().settings.resume && pos > 2 && pos < d - 2) {
        setPlayer(player, { currentTime: pos });
        progress.set(pos / d);
      }
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const d = player.duration;
    if (!d || scrubbing.get()) return;
    const loopAB = getState().videos[id]?.ab;
    if (loopAB && !getState().abEditId && currentTime >= loopAB[1]) {
      setPlayer(player, { currentTime: loopAB[0] });
      progress.set(loopAB[0] / d);
      return;
    }
    const next = currentTime / d;
    if (next < progress.get() - 0.02) progress.set(next); // looped
    else progress.set(withTiming(next, { duration: 250, easing: Easing.linear }));
    if (!markedWatched.current && (next > 0.85 || currentTime > 45)) {
      markedWatched.current = true;
      updateVideo(id, { watched: true });
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (!markedWatched.current) {
      markedWatched.current = true;
      updateVideo(id, { watched: true });
    }
    if (getState().settings.onEnd === 'next') props.onEnded(id);
  });

  useEffect(() => {
    setPlayer(player, { loop });
  }, [loop, player]);

  // Swiping away while setting A-B ends the editing.
  useEffect(() => {
    if (!isActive && abEditing) setState(() => ({ abEditId: null }));
  }, [isActive, abEditing]);

  // Finer time updates while a section repeats, so the jump back lands on time.
  useEffect(() => {
    setPlayer(player, { timeUpdateEventInterval: ab ? 0.1 : 0.25 });
  }, [ab, player]);

  const shouldPlay = isActive && screenFocused && !userPaused;
  useEffect(() => {
    if (shouldPlay) {
      if (getState().settings.onEnd === 'next') {
        // Came back to a finished reel: start it over instead of sitting on the last frame.
        if (player.duration && player.currentTime >= player.duration - 0.3) setPlayer(player, { currentTime: 0 });
      }
      const sec = getState().videos[id]?.ab;
      if (sec && (player.currentTime < sec[0] - 0.5 || player.currentTime > sec[1])) {
        setPlayer(player, { currentTime: sec[0] });
      }
      player.play();
    } else {
      player.pause();
      savePosition(player, id); // covers swiping away, opening the library, backgrounding
    }
  }, [shouldPlay, player, id]);

  useEffect(() => {
    setPlayer(player, { muted });
  }, [muted, player]);

  // Leaving this reel forgets a manual pause (state adjusted during render, per React docs).
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) setUserPaused(false);
  }

  useEffect(() => {
    pausedIcon.set(withTiming(userPaused ? 1 : 0, { duration: userPaused ? 160 : 120, easing: EASE_OUT }));
  }, [userPaused, pausedIcon]);

  // ----- gestures -----
  const startHold = () => {
    holdActive.current = true;
    const base = getState().settings.holdSpeed;
    holdBase.current = base;
    liveRef.current = base;
    setLiveSpeed(base);
    setPlayer(player, { playbackRate: base });
    if (userPaused) {
      setUserPaused(false);
    }
    holding.set(withTiming(1, { duration: 140, easing: EASE_OUT }));
    props.onHoldChange(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  // While holding, slide right for faster, left for slower: 0.25× per 36pt, 1.25×–3×.
  const slideHold = (dx: number) => {
    if (!holdActive.current) return;
    const raw = holdBase.current + Math.round(dx / 36) * 0.25;
    const next = Math.min(3, Math.max(1.25, raw));
    if (next === liveRef.current) return;
    liveRef.current = next;
    setPlayer(player, { playbackRate: next });
    setLiveSpeed(next);
    Haptics.selectionAsync();
  };
  const endHold = () => {
    if (!holdActive.current) return;
    holdActive.current = false;
    setPlayer(player, { playbackRate: 1 });
    holding.set(withTiming(0, { duration: 180, easing: EASE_OUT }));
    props.onHoldChange(false);
  };

  // ----- A-B repeat -----
  const setA = () => {
    const t = player.currentTime;
    setDraftA(t);
    updateVideo(id, { ab: undefined });
    Haptics.selectionAsync();
  };
  const setB = () => {
    const t = player.currentTime;
    const a = draftA ?? ab?.[0] ?? null;
    if (a === null || t < a + 0.5) {
      // B before A: treat this tap as a new A
      setDraftA(t);
      return;
    }
    updateVideo(id, { ab: [a, t] });
    setDraftA(null);
    setPlayer(player, { currentTime: a });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const clearAB = () => {
    setDraftA(null);
    updateVideo(id, { ab: undefined });
  };
  const doneAB = () => {
    setDraftA(null);
    setState(() => ({ abEditId: null }));
  };

  const setFit = (fit: 'fill' | 'fit') => {
    const current = getState().videos[id]?.fit;
    if (current === fit) return;
    updateVideo(id, { fit });
    setFitLabel(fit === 'fill' ? 'Fill screen' : 'Fit to screen');
    fitToast.set(withSequence(withTiming(1, { duration: 120 }), withDelay(700, withTiming(0, { duration: 220 }))));
    Haptics.selectionAsync();
  };

  // Hold-to-speed is a pan that only activates after a 260ms hold, so it can then track a slide.
  const longPress = usePanGesture({
    activateAfterLongPress: 260,
    runOnJS: true,
    onActivate: () => startHold(),
    onUpdate: (e) => slideHold(e.translationX),
    onFinalize: () => endHold(),
  });
  const singleTap = useTapGesture({
    maxDistance: 14,
    runOnJS: true,
    onActivate: () => setUserPaused((p) => !p),
  });
  // Pinch out to crop-fill, pinch in to see the whole frame (remembered per video).
  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (e) => pinchScale.set(e.scale),
    onDeactivate: () => {
      const sc = pinchScale.get();
      pinchScale.set(1);
      if (sc > 1.12) setFit('fill');
      else if (sc < 0.9) setFit('fit');
    },
  });
  // No double-tap: a single tap pauses instantly instead of waiting to rule one out.
  const taps = useExclusiveGestures(longPress, singleTap);
  // Pinch runs alongside, never blocking hold-to-speed (which would otherwise wait for it to fail).
  const gesture = useSimultaneousGestures(pinch, taps);

  // ----- animated styles -----
  const pausedStyle = useAnimatedStyle(() => ({
    opacity: pausedIcon.get(),
    transform: [{ scale: 0.85 + pausedIcon.get() * 0.15 }],
  }));
  const fitStyle = useAnimatedStyle(() => ({ opacity: fitToast.get() }));
  // Live preview while pinching: the frame follows your fingers a little, then snaps to the new mode.
  const videoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: Math.min(1.25, Math.max(0.85, 1 + (pinchScale.get() - 1) * 0.5)) }],
  }));

  return (
    <>
      {mode === 'blur' && ambient && (
        <AmbientGlow player={player} active={isActive && screenFocused && ready} poster={video.thumb} />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, !ready && styles.hidden]}
          contentFit={mode === 'fill' ? 'cover' : 'contain'}
          nativeControls={false}
          surfaceType="textureView"
        />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill}>
          <Animated.View pointerEvents="none" style={[styles.center, pausedStyle]}>
            <View style={styles.playDisc}>
              <Ionicons name="play" size={34} color={colors.text} style={{ marginLeft: 4 }} />
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.fitToast, fitStyle]}>
            <Text style={styles.seekText}>{fitLabel}</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <Chrome
        {...props}
        player={player}
        duration={duration}
        progress={progress}
        scrubbing={scrubbing}
        holding={holding}
        holdSpeed={liveSpeed}
        ab={ab}
        abBar={
          <ABBar
            editing={abEditing}
            a={draftA ?? ab?.[0] ?? null}
            b={draftA !== null ? null : (ab?.[1] ?? null)}
            onSetA={setA}
            onSetB={setB}
            onClear={clearAB}
            onDone={doneAB}
            onEdit={() => setState(() => ({ abEditId: id }))}
          />
        }
      />
    </>
  );
}

/** Native player props are setters; mutate them outside components so the React Compiler stays happy. */
function setPlayer(player: VideoPlayer, patch: Partial<Pick<VideoPlayer, 'muted' | 'playbackRate' | 'currentTime' | 'loop' | 'timeUpdateEventInterval'>>) {
  try {
    Object.assign(player, patch);
  } catch {
    // player released
  }
}

function savePosition(player: VideoPlayer, id: string) {
  try {
    const t = player.currentTime;
    const d = player.duration;
    if (!d) return;
    const position = t > d - 2 ? 0 : t;
    const v = getState().videos[id];
    if (v && Math.abs(v.position - position) > 1) updateVideo(id, { position });
  } catch {
    // player already released
  }
}

// ---------------- overlay chrome ----------------

type ChromeProps = Props & {
  player: VideoPlayer | null;
  duration: number;
  progress?: ReturnType<typeof useSharedValue<number>>;
  scrubbing?: ReturnType<typeof useSharedValue<boolean>>;
  holding?: ReturnType<typeof useSharedValue<number>>;
  holdSpeed?: number;
  ab?: [number, number] | null;
  abBar?: React.ReactNode;
};

function Chrome(p: ChromeProps) {
  const video = useLibrary((s) => s.videos[p.id])!;
  const mode = useDisplayMode(video, p.width, p.height);
  const collections = useLibrary((s) => s.collections);
  const inCollection = collections.some((c) => c.ids.includes(p.id));
  const fallbackProgress = useSharedValue(0);
  const fallbackScrub = useSharedValue(false);
  const fallbackHold = useSharedValue(0);
  const progress = p.progress ?? fallbackProgress;
  const scrubbing = p.scrubbing ?? fallbackScrub;
  const holding = p.holding ?? fallbackHold;
  const [scrubActive, setScrubActive] = useState(false);

  // While holding for speed, hide everything but the speed badge, like the real thing.
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - holding.get() }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: holding.get(),
    transform: [{ translateY: (1 - holding.get()) * -8 }],
  }));

  const date = new Date(video.mtime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const meta = [p.duration ? formatTime(p.duration) : null, formatSize(video.size), date].filter(Boolean).join('  ·  ');

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.badgeWrap, { top: p.topInset + 64 }, badgeStyle]}>
        <View style={styles.badgeRow}>
          <Ionicons name="chevron-back" size={16} color="rgba(244,239,231,0.55)" />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatSpeed(p.holdSpeed ?? 2)}×</Text>
            <Ionicons name="play-forward" size={14} color={colors.accentInk} />
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(244,239,231,0.55)" />
        </View>
        <Text style={styles.badgeHint}>Slide to change speed</Text>
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, chromeStyle]}>
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(8,7,6,0.35)', 'rgba(8,7,6,0.82)']}
          locations={[0, 0.45, 1]}
          style={styles.bottomShade}
        />

        <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: p.bottomInset + 4 }]}>
          {!scrubActive && (
            <View pointerEvents="box-none" style={styles.infoRow}>
              <View pointerEvents="none" style={styles.info}>
                <Text style={styles.title} numberOfLines={2}>
                  {video.name}
                </Text>
                <Text style={styles.meta}>{meta}</Text>
              </View>
              <SideActions
                inCollection={inCollection}
                mode={mode}
                onCollect={() => p.onAddToCollection(p.id)}
                onFit={() => {
                  updateVideo(p.id, { fit: mode === 'fill' ? 'fit' : 'fill' });
                  Haptics.selectionAsync();
                }}
                onMenu={() => p.onOpenMenu(p.id)}
              />
            </View>
          )}
          {p.player && p.abBar}
          {p.player ? (
            <ProgressBar
              ab={p.ab ?? null}
              progress={progress}
              scrubbing={scrubbing}
              duration={p.duration}
              dimmed={holding}
              onScrubChange={setScrubActive}
              onSeek={(s) => {
                if (p.player) setPlayer(p.player, { currentTime: s });
              }}
            />
          ) : (
            <View style={{ height: 36 }} />
          )}
        </View>
      </Animated.View>
    </>
  );
}

function SideActions({
  inCollection,
  mode,
  onCollect,
  onFit,
  onMenu,
}: {
  inCollection: boolean;
  mode: WideMode;
  onCollect: () => void;
  onFit: () => void;
  onMenu: () => void;
}) {
  return (
    <View style={styles.actions}>
      <ActionButton
        icon={inCollection ? 'albums' : 'albums-outline'}
        color={inCollection ? colors.accent : colors.text}
        label="Collect"
        onPress={onCollect}
      />
      <ActionButton
        icon={mode === 'fill' ? 'contract-outline' : 'expand-outline'}
        label={mode === 'fill' ? 'Fit' : 'Fill'}
        onPress={onFit}
      />
      <ActionButton icon="ellipsis-horizontal" label="More" onPress={onMenu} />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color = colors.text,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.88} style={styles.action} accessibilityLabel={label}>
      <Ionicons name={icon} size={29} color={color} style={styles.iconShadow} />
      <Text style={styles.actionLabel}>{label}</Text>
    </PressableScale>
  );
}

function formatSpeed(x: number) {
  return Number.isInteger(x) ? `${x}` : x.toFixed(2).replace(/0$/, '');
}

function formatSize(bytes: number) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  blurDim: { backgroundColor: 'rgba(8,7,6,0.45)' },
  fitToast: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playDisc: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekChip: {
    position: 'absolute',
    top: '46%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  seekText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  info: { flex: 1, paddingBottom: space.sm },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
  },
  meta: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  actions: { alignItems: 'center', gap: space.lg, paddingBottom: space.sm },
  action: { alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' },
  actionLabel: { marginTop: 3, fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 10 },
  badgeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badgeHint: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: 'rgba(244,239,231,0.6)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  badgeText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.accentInk, fontVariant: ['tabular-nums'] },
});
