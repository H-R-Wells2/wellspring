import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { shareVideo } from '@/lib/share';
import { deleteFromDevice } from '@/lib/sources';
import { getState, hideVideo, setState, updateVideo, useLibrary } from '@/store/library';
import { colors, fonts, formatTime, radius, space } from '@/theme';

export function ReelMenu({
  id,
  onClose,
  onAddToCollection,
  inFeed = true,
}: {
  id: string | null;
  onClose: () => void;
  onAddToCollection: (id: string) => void;
  /** A-B repeat only makes sense where the video is playing. */
  inFeed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const video = useLibrary((s) => (id ? s.videos[id] : undefined));

  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (!video || sharing) return;
    setSharing(true);
    try {
      await shareVideo(video.uri, video.name);
      onClose();
    } catch {
      Alert.alert("Couldn't share this video", 'The file may have moved or be unreadable. Try a rescan from Settings.');
    } finally {
      setSharing(false);
    }
  };

  const remove = () => {
    if (!id) return;
    onClose();
    hideVideo(id);
  };

  const del = () => {
    if (!id || !video) return;
    Alert.alert('Delete from phone?', `"${video.name}" will be permanently deleted from your device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const ok = deleteFromDevice(video.uri);
          onClose();
          hideVideo(id);
          if (!ok)
            Alert.alert(
              'Removed from Wellspring only',
              'Android did not allow deleting this file. It is hidden here but still on your phone.',
            );
        },
      },
    ]);
  };

  const source = video ? getState().sources.find((s) => s.id === video.sourceId) : undefined;
  const collections = useLibrary((s) => s.collections);
  const inCollections = id ? collections.filter((c) => c.ids.includes(id)).length : 0;
  const resolution = video?.width && video?.height ? `${video.width}×${video.height}` : '—';

  return (
    <Modal
      visible={!!id}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      {video && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.grabber} />
          <Text style={styles.name} numberOfLines={2}>
            {video.name}
          </Text>
          <View style={styles.facts}>
            <Fact label="Length" value={video.duration ? formatTime(video.duration) : '—'} />
            <Fact label="Size" value={`${(video.size / 1048576).toFixed(1)} MB`} />
            <Fact label="Frame" value={resolution} />
          </View>
          {source && <Text style={styles.source}>From {source.name}</Text>}
          <View style={styles.divider} />

          <Row
            icon="albums-outline"
            label={
              inCollections ? `In ${inCollections} collection${inCollections > 1 ? 's' : ''}` : 'Add to collection'
            }
            onPress={() => {
              onClose();
              onAddToCollection(video.id);
            }}
          />
          {inFeed && (
            <Row
              icon="repeat-outline"
              label={video.ab ? 'Edit repeat section (A–B)' : 'Repeat a section (A–B)'}
              onPress={() => {
                onClose();
                setState(() => ({ abEditId: video.id }));
              }}
            />
          )}
          <Row
            icon={video.fit === 'fill' ? 'contract-outline' : 'expand-outline'}
            label={video.fit === 'fill' ? 'Show whole frame' : 'Fill the screen'}
            onPress={() => updateVideo(video.id, { fit: video.fit === 'fill' ? 'fit' : 'fill' })}
          />
          <Row
            icon={video.watched ? 'eye-outline' : 'checkmark-done-outline'}
            label={video.watched ? 'Mark as unseen' : 'Mark as seen'}
            onPress={() => updateVideo(video.id, { watched: !video.watched })}
          />
          <Row
            icon="share-social-outline"
            label={sharing ? 'Preparing to share…' : 'Share'}
            busy={sharing}
            onPress={share}
          />
          <Row icon="eye-off-outline" label="Hide from Wellspring" onPress={remove} />
          <Row icon="trash-outline" label="Delete from phone" danger onPress={del} />
        </View>
      )}
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  danger,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const c = danger ? colors.danger : colors.text;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row} disabled={busy}>
      {busy ? <ActivityIndicator size="small" color={colors.accent} style={{ width: 22 }} /> : <Ionicons name={icon} size={22} color={c} />}
      <Text style={[styles.rowLabel, { color: c }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.lg,
  },
  name: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: colors.text },
  facts: { flexDirection: 'row', gap: space.xl, marginTop: space.lg },
  fact: {},
  factLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  factValue: {
    marginTop: 2,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  source: { marginTop: space.md, fontFamily: fonts.regular, fontSize: 13, color: colors.textDim },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 54,
    marginTop: space.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  rowLabel: { fontFamily: fonts.medium, fontSize: 16 },
});
