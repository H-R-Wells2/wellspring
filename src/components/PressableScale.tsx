import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT } from '@/theme';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
};

/** Press feedback: scale down on press-in (100ms), settle back on press-out. No re-render. */
export function PressableScale({ style, scaleTo = 0.94, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      hitSlop={8}
      pressRetentionOffset={16}
      {...rest}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: 100, easing: EASE_OUT }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 160, easing: EASE_OUT }));
        rest.onPressOut?.(e);
      }}>
      <Animated.View style={[style, animated]}>{children as React.ReactNode}</Animated.View>
    </Pressable>
  );
}
