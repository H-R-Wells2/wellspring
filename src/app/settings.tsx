import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { addFiles, addFolder, rescanAll } from '@/lib/sources';
import { clearLibrary, getState, removeSource, setState, updateSettings, useLibrary, type FeedOrder, type WideMode } from '@/store/library';
import { colors, fonts, radius, space } from '@/theme';

const SPEEDS = [1.5, 2, 3];

const ORDERS: { value: FeedOrder; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'newest', label: 'Newest', icon: 'arrow-down' },
  { value: 'unwatched', label: 'Unseen', icon: 'sparkles-outline' },
  { value: 'shuffle', label: 'Shuffle', icon: 'shuffle' },
  { value: 'oldest', label: 'Oldest', icon: 'arrow-up' },
];
const ORDER_HINT: Record<FeedOrder, string> = {
  newest: 'Latest downloads first',
  unwatched: "Reels you haven't finished come first",
  shuffle: 'A fresh random order every session',
  oldest: 'From the very first download',
};

const WIDE_OPTIONS: { value: WideMode; label: string; hint: string }[] = [
  { value: 'blur', label: 'Blur', hint: 'Whole frame, blurred copy behind it' },
  { value: 'fit', label: 'Fit', hint: 'Whole frame, black bars' },
  { value: 'fill', label: 'Crop', hint: 'Fill the screen, edges cut off' },
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const settings = useLibrary((s) => s.settings);
  const sources = useLibrary((s) => s.sources);
  const videos = useLibrary((s) => s.videos);
  const scanning = useLibrary((s) => s.scanning);

  const folders = sources.filter((s) => s.kind === 'folder');
  const singleFiles = sources.filter((s) => s.kind === 'file').length;
  const countFor = (id: string) => Object.values(videos).filter((v) => v.sourceId === id).length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <PressableScale style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </PressableScale>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.xl }}>
        <Section title="Playback">
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Hold speed</Text>
              <Text style={styles.rowHint}>Press and hold a reel to play faster</Text>
            </View>
            <View style={styles.speeds}>
              {SPEEDS.map((sp) => {
                const on = settings.holdSpeed === sp;
                return (
                  <PressableScale
                    key={sp}
                    onPress={() => updateSettings({ holdSpeed: sp })}
                    style={[styles.speed, on && styles.speedOn]}
                    scaleTo={0.94}>
                    <Text style={[styles.speedText, on && styles.speedTextOn]}>{sp}×</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
          <Toggle
            label="Resume where I left off"
            hint="Reopen a reel at the point you stopped"
            value={settings.resume}
            onChange={(resume) => updateSettings({ resume })}
          />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Play order</Text>
              <Text style={styles.rowHint}>{ORDER_HINT[settings.order]}</Text>
            </View>
          </View>
          <View style={styles.orderRow}>
            {ORDERS.map((o) => {
              const on = settings.order === o.value;
              return (
                <PressableScale
                  key={o.value}
                  onPress={() => updateSettings({ order: o.value })}
                  style={[styles.orderChip, on && styles.speedOn]}
                  accessibilityLabel={o.label}>
                  <Ionicons name={o.icon} size={15} color={on ? colors.accentInk : colors.textDim} />
                  <Text style={[styles.speedText, on && styles.speedTextOn]}>{o.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>When a reel ends</Text>
              <Text style={styles.rowHint}>{settings.onEnd === 'loop' ? 'Replay it, like Reels' : 'Slide to the next one'}</Text>
            </View>
            <View style={styles.speeds}>
              {(['loop', 'next'] as const).map((v) => {
                const on = settings.onEnd === v;
                return (
                  <PressableScale key={v} onPress={() => updateSettings({ onEnd: v })} style={[styles.speed, on && styles.speedOn]}>
                    <Text style={[styles.speedText, on && styles.speedTextOn]}>{v === 'loop' ? 'Loop' : 'Next'}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
          <Toggle label="Muted" value={settings.muted} onChange={(muted) => updateSettings({ muted })} last />
        </Section>

        <Section title="Display">
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Vertical reels</Text>
              <Text style={styles.rowHint}>
                {settings.verticalMode === 'fill'
                  ? 'Fill the screen edge to edge (may crop)'
                  : 'Show the whole frame (default)'}
              </Text>
            </View>
            <View style={styles.speeds}>
              {(['ambient', 'fill'] as const).map((v) => {
                const on = settings.verticalMode === v;
                return (
                  <PressableScale
                    key={v}
                    onPress={() => updateSettings({ verticalMode: v })}
                    style={[styles.speed, on && styles.speedOn]}>
                    <Text style={[styles.speedText, on && styles.speedTextOn]}>{v === 'fill' ? 'Fill' : 'Fit'}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
          <Toggle
            label="Ambient glow"
            hint="Around a video that doesn't fill the screen, the edges glow with the colors playing right now"
            value={settings.ambient}
            onChange={(ambient) => updateSettings({ ambient })}
            last
          />
        </Section>

        <Section title="Horizontal & square videos">
          <View style={styles.wideRow}>
            {WIDE_OPTIONS.map((o) => {
              const on = settings.wideMode === o.value;
              return (
                <PressableScale
                  key={o.value}
                  onPress={() => updateSettings({ wideMode: o.value })}
                  scaleTo={0.96}
                  style={[styles.wideCard, on && styles.wideCardOn]}
                  accessibilityLabel={`${o.label}: ${o.hint}`}>
                  <WidePreview mode={o.value} />
                  <Text style={[styles.wideLabel, on && { color: colors.accent }]}>{o.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={[styles.rowHint, { paddingBottom: space.md }]}>
            {WIDE_OPTIONS.find((o) => o.value === settings.wideMode)?.hint}. Pinch any reel to switch
            between filling the screen and showing the whole frame for that video.
          </Text>
          <PressableScale
            style={styles.linkRow}
            scaleTo={0.98}
            onPress={() => {
              const videos = { ...getState().videos };
              for (const k of Object.keys(videos)) if (videos[k].fit) videos[k] = { ...videos[k], fit: undefined };
              setState(() => ({ videos }));
            }}>
            <Text style={styles.linkText}>Clear per-video pinch choices</Text>
          </PressableScale>
        </Section>

        <Section title="Folders">
          {folders.length === 0 && <Text style={styles.empty}>No folders yet.</Text>}
          {folders.map((f) => (
            <View key={f.id} style={styles.row}>
              <Ionicons name="folder-outline" size={20} color={colors.textDim} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={styles.rowHint}>{countFor(f.id)} videos</Text>
              </View>
              <PressableScale
                style={styles.smallBtn}
                accessibilityLabel={`Remove ${f.name}`}
                onPress={() =>
                  Alert.alert('Remove folder?', 'Its videos leave Wellspring. Nothing is deleted from your phone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeSource(f.id) },
                  ])
                }>
                <Ionicons name="close" size={18} color={colors.textDim} />
              </PressableScale>
            </View>
          ))}
          {singleFiles > 0 && <Text style={styles.rowHint}>+ {singleFiles} individually picked videos</Text>}
          <View style={styles.buttonRow}>
            <Button icon="folder-open-outline" label="Add folder" onPress={addFolder} />
            <Button icon="add" label="Add videos" onPress={addFiles} />
            <Button icon="refresh" label={scanning ? 'Scanning…' : 'Rescan'} onPress={() => void rescanAll()} />
          </View>
        </Section>

        <Section title="Library">
          <PressableScale
            style={styles.dangerRow}
            scaleTo={0.98}
            onPress={() =>
              Alert.alert('Reset Wellspring?', 'Removes all folders, saves and resume points. Your video files stay on the phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: clearLibrary },
              ])
            }>
            <Text style={styles.dangerText}>Reset library</Text>
          </PressableScale>
        </Section>
      </ScrollView>
    </View>
  );
}

/** A tiny phone with a wide video in it, drawn for each mode. */
function WidePreview({ mode }: { mode: WideMode }) {
  return (
    <View style={styles.phone}>
      {mode === 'blur' && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#5A3A2C', opacity: 0.55 }]} />}
      {mode === 'fill' ? (
        <View style={[StyleSheet.absoluteFill, styles.scene]}>
          <View style={styles.sun} />
        </View>
      ) : (
        <View style={styles.wideFrame}>
          <View style={styles.sunSmall} />
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.line, true: colors.accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

function Button({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale style={styles.btn} onPress={onPress} scaleTo={0.96}>
      <Ionicons name={icon} size={17} color={colors.text} />
      <Text style={styles.btnText}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  title: { fontFamily: fonts.heavy, fontSize: 22, letterSpacing: -0.6, color: colors.text },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.text },
  rowHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textDim },
  speeds: { flexDirection: 'row', gap: 6 },
  speed: {
    minWidth: 44,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  speedOn: { backgroundColor: colors.accent },
  speedText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.text, fontVariant: ['tabular-nums'] },
  speedTextOn: { color: colors.accentInk },
  smallBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.textDim, paddingVertical: space.lg },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.lg },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  btnText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  orderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  orderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  dangerRow: { minHeight: 56, justifyContent: 'center' },
  wideRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.lg },
  wideCard: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  wideCardOn: { borderColor: colors.accent },
  wideLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  phone: {
    width: 40,
    height: 72,
    borderRadius: 7,
    backgroundColor: '#000',
    overflow: 'hidden',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  scene: { backgroundColor: '#C9744E', alignItems: 'center', justifyContent: 'center' },
  sun: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F4D9A6' },
  wideFrame: { height: 22, backgroundColor: '#C9744E', alignItems: 'center', justifyContent: 'center' },
  sunSmall: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F4D9A6' },
  linkRow: { minHeight: 48, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  linkText: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.textDim },
  dangerText: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.danger },
});
