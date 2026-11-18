import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { createCollection, toggleInCollection, useLibrary } from '@/store/library';
import { colors, fonts, radius, space } from '@/theme';

/** "Add to collection" for one video: tick existing collections or make a new one. */
export function AddToCollectionSheet({ videoId, onClose }: { videoId: string | null; onClose: () => void }) {
  const collections = useLibrary((s) => s.collections);
  const [draft, setDraft] = useState('');

  const create = () => {
    if (!videoId || !draft.trim()) return;
    createCollection(draft, videoId);
    setDraft('');
    Haptics.selectionAsync();
  };

  return (
    <Sheet visible={!!videoId} onClose={onClose} title="Add to collection">
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
        {collections.length === 0 && (
          <Text style={styles.hint}>Group reels your way: Gym, Recipes, Funny, Ideas…</Text>
        )}
        {collections.map((c) => {
          const inIt = !!videoId && c.ids.includes(videoId);
          return (
            <PressableScale
              key={c.id}
              scaleTo={0.98}
              style={styles.row}
              onPress={() => {
                if (!videoId) return;
                toggleInCollection(c.id, videoId);
                Haptics.selectionAsync();
              }}>
              <View style={[styles.check, inIt && styles.checkOn]}>
                {inIt && <Ionicons name="checkmark" size={16} color={colors.accentInk} />}
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.count}>{c.ids.length}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.newRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="New collection"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={create}
          maxLength={40}
        />
        <PressableScale
          style={[styles.addBtn, !draft.trim() && { opacity: 0.4 }]}
          onPress={create}
          disabled={!draft.trim()}
          accessibilityLabel="Create collection">
          <Ionicons name="add" size={22} color={colors.accentInk} />
        </PressableScale>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  count: { fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  hint: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textDim, paddingVertical: space.sm },
  section: {
    marginTop: space.md,
    marginBottom: space.xs,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
