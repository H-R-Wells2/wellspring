import { Easing } from 'react-native-reanimated';

/** Warm-black cinema palette with a single ember accent. */
export const colors = {
  bg: '#0C0B0A',
  surface: '#171513',
  surfaceRaised: '#211E1B',
  line: '#2E2A26',
  text: '#F4EFE7',
  textDim: '#A39A8E',
  textFaint: '#6B645B',
  accent: '#FF5B2E',
  accentInk: '#1A0B05',
  scrim: 'rgba(8,7,6,0.55)',
  danger: '#FF4D4D',
} as const;

export const fonts = {
  light: 'BricolageGrotesque_300Light',
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  heavy: 'BricolageGrotesque_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export function formatTime(seconds: number) {
  'worklet';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
