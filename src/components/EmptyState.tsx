import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { addFiles, addFolder } from '@/lib/sources';
import { useLibrary } from '@/store/library';
import { colors, fonts, radius, space } from '@/theme';

export function EmptyState({ filtered }: { filtered: 'folders' | 'collection' | null }) {
  const insets = useSafeAreaInsets();
  const scanning = useLibrary((s) => s.scanning);
  const hasVideos = useLibrary((s) => Object.keys(s.videos).length > 0);

  if (filtered && hasVideos) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, alignItems: 'center', gap: space.md }]}>
        <Ionicons name={filtered === 'folders' ? 'folder-open-outline' : 'albums-outline'} size={40} color={colors.textFaint} />
        <Text style={styles.smallTitle}>{filtered === 'folders' ? 'No videos in these folders' : 'This collection is empty'}</Text>
        <Text style={[styles.body, { textAlign: 'center' }]}>
          {filtered === 'folders'
            ? 'Pick other folders on the home screen.'
            : 'Add reels with the Collect button on any reel.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>wellspring</Text>
        <Text style={styles.title}>Your reels,{'\n'}always flowing.</Text>
        <Text style={styles.body}>
          Choose the folder where your downloaded reels live. Wellspring plays them where they are, so
          nothing gets copied, and new downloads appear next time you open the app.
        </Text>
      </View>

      {scanning ? (
        <View style={styles.scanning}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.scanText}>Looking for videos…</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <PressableScale style={styles.primary} scaleTo={0.97} onPress={addFolder}>
            <Ionicons name="folder-open" size={20} color={colors.accentInk} />
            <Text style={styles.primaryText}>Choose a folder</Text>
          </PressableScale>
          <PressableScale style={styles.secondary} scaleTo={0.97} onPress={addFiles}>
            <Text style={styles.secondaryText}>Pick individual videos</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.xl,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: space.xxl,
  },
  hero: { gap: space.lg },
  kicker: { fontFamily: fonts.heavy, fontSize: 15, color: colors.accent, letterSpacing: -0.2 },
  title: { fontFamily: fonts.heavy, fontSize: 46, lineHeight: 48, color: colors.text, letterSpacing: -1.5 },
  smallTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.textDim, maxWidth: 340 },
  buttons: { gap: space.md },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.accentInk },
  secondary: { height: 52, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 56 },
  scanText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textDim },
});
