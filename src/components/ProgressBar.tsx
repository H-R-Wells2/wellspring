import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, EASE_OUT, fonts, formatTime } from '@/theme';

type Props = {
  progress: SharedValue<number>; // 0..1
  scrubbing: SharedValue<boolean>;
  duration: number;
  onSeek: (seconds: number) => void;
  onScrubChange: (active: boolean) => void;
  dimmed: SharedValue<number>;
  /** Repeat section, drawn on the track. */
  ab?: [number, number] | null;
};

const HIT_HEIGHT = 36;

export function ProgressBar({ progress, scrubbing, duration, onSeek, onScrubChange, dimmed, ab }: Props) {
  const width = useSharedValue(1);
  const engaged = useSharedValue(0);
  const [label, setLabel] = useState<string | null>(null);

  const setLabelFromSecond = (sec: number) => {
    setLabel(`${formatTime(sec)} / ${formatTime(duration)}`);
    onSeek(sec);
  };

  // Live seek + label only when the whole second changes, never per frame.
  useAnimatedReaction(
    () => (scrubbing.get() ? Math.floor(progress.get() * duration) : -1),
    (sec, prev) => {
      if (sec >= 0 && sec !== prev) scheduleOnRN(setLabelFromSecond, sec);
    },
  );

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-18, 18],
    onActivate: (e) => {
      scrubbing.set(true);
      engaged.set(withTiming(1, { duration: 140, easing: EASE_OUT }));
      progress.set(Math.min(1, Math.max(0, e.x / width.get())));
      scheduleOnRN(onScrubChange, true);
    },
    onUpdate: (e) => {
      progress.set(Math.min(1, Math.max(0, e.x / width.get())));
    },
    onFinalize: (e) => {
      if (!scrubbing.get()) return;
      scrubbing.set(false);
      engaged.set(withTiming(0, { duration: 220, easing: EASE_OUT }));
      scheduleOnRN(onSeek, progress.get() * duration);
      scheduleOnRN(onScrubChange, false);
      scheduleOnRN(setLabel, null);
    },
  });

  const tap = useTapGesture({
    onActivate: (e) => {
      const p = Math.min(1, Math.max(0, e.x / width.get()));
      progress.set(p);
      scheduleOnRN(onSeek, p * duration);
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + engaged.get() * 1.5 }],
    opacity: 1 - dimmed.get() * 0.7,
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const knobStyle = useAnimatedStyle(() => ({
    left: `${progress.get() * 100}%`,
    opacity: engaged.get(),
    transform: [{ translateX: -7 }, { scale: 0.6 + engaged.get() * 0.4 }],
  }));

  return (
    <>
      {label && (
        <View pointerEvents="none" style={styles.labelWrap}>
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
      <GestureDetector gesture={gesture}>
        <View style={styles.hit} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.fill, fillStyle]} />
            {ab && duration > 0 && (
              <View
                style={[
                  styles.abRange,
                  { left: `${(ab[0] / duration) * 100}%`, width: `${((ab[1] - ab[0]) / duration) * 100}%` },
                ]}
              />
            )}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.knob, knobStyle]} />
        </View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  hit: { height: HIT_HEIGHT, justifyContent: 'center' },
  track: {
    height: 2,
    backgroundColor: 'rgba(244,239,231,0.22)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  abRange: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.accent, opacity: 0.75 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.text },
  knob: {
    position: 'absolute',
    top: HIT_HEIGHT / 2 - 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
  },
  labelWrap: { alignItems: 'center', marginBottom: 18 },
  label: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 12,
  },
});
