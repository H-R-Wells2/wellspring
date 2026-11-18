import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { colors, fonts, formatTime, radius, space } from '@/theme';

type Props = {
  editing: boolean;
  a: number | null;
  b: number | null;
  onSetA: () => void;
  onSetB: () => void;
  onClear: () => void;
  onDone: () => void;
  onEdit: () => void;
};

/**
 * Repeat-a-section controls. While editing: tap A and B at the moments you want.
 * Afterwards it collapses to a small chip that shows the loop and can clear it.
 */
export function ABBar({ editing, a, b, onSetA, onSetB, onClear, onDone, onEdit }: Props) {
  if (!editing) {
    if (a === null || b === null) return null;
    return (
      <View style={styles.chipRow}>
        <PressableScale style={styles.chip} onPress={onEdit} accessibilityLabel="Edit repeat section">
          <Ionicons name="repeat" size={14} color={colors.accentInk} />
          <Text style={styles.chipText}>
            {formatTime(a)}–{formatTime(b)}
          </Text>
        </PressableScale>
        <PressableScale style={styles.chipClear} onPress={onClear} accessibilityLabel="Stop repeating section">
          <Ionicons name="close" size={14} color={colors.text} />
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Point label="A" value={a} onPress={onSetA} active={a === null} />
      <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
      <Point label="B" value={b} onPress={onSetB} active={a !== null && b === null} />
      <View style={{ flex: 1 }} />
      {(a !== null || b !== null) && (
        <PressableScale style={styles.icon} onPress={onClear} accessibilityLabel="Clear points">
          <Ionicons name="refresh" size={18} color={colors.textDim} />
        </PressableScale>
      )}
      <PressableScale style={styles.done} onPress={onDone} accessibilityLabel="Done">
        <Text style={styles.doneText}>Done</Text>
      </PressableScale>
    </View>
  );
}

function Point({ label, value, onPress, active }: { label: string; value: number | null; onPress: () => void; active: boolean }) {
  return (
    <PressableScale style={[styles.point, active && styles.pointActive]} onPress={onPress} accessibilityLabel={`Set ${label} here`}>
      <Text style={[styles.pointLabel, active && { color: colors.accentInk }]}>{label}</Text>
      <Text style={[styles.pointTime, active && { color: colors.accentInk }]}>
        {value === null ? 'set' : formatTime(value)}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: 6,
    marginBottom: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(23,21,19,0.82)',
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  pointActive: { backgroundColor: colors.accent },
  pointLabel: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  pointTime: { fontFamily: fonts.medium, fontSize: 13, color: colors.textDim, fontVariant: ['tabular-nums'] },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  done: { height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.text, justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 14, color: colors.bg },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  chipText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.accentInk, fontVariant: ['tabular-nums'] },
  chipClear: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23,21,19,0.7)',
  },
});
