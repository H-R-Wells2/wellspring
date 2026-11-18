import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** The lockup: flowing-W mark + **well**spring (bold + light, split on meaning). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Wellspring">
      <Image source={require('@/assets/images/mark.png')} style={{ width: size * 1.25, height: size * 1.25 }} />
      <Text style={[styles.text, { fontSize: size, lineHeight: size * 1.15 }]}>
        <Text style={styles.well}>well</Text>
        <Text style={styles.spring}>spring</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { letterSpacing: -0.6 },
  well: { fontFamily: fonts.heavy, color: colors.text },
  spring: { fontFamily: fonts.light, color: colors.textDim },
});
