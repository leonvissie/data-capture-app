import React, { useMemo } from 'react';
import { Alert, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import DocumentActionCard from './DocumentActionCard';
import { useTones } from '../theme/tones';
import { Safe, Document } from '../data/types';
import { IconButtonGroup } from './IconButton';
import { FloatingIconRoundButton } from './RoundIconButton';
import { deleteEntity, listByType } from '../data/sqlite';
import { deleteOwnedDocFile } from '../utils/docCrypto';
import { logger } from '@/src/utils/logger';

type SafeCardProps = {
  safes: Safe[];
  onAdd: () => void;
  onPressSafe?: (safe: Safe) => void;
  onPreviewSafe?: (safe: Safe) => void;
  onDeleteSafe?: (safe: Safe) => void;
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
};

const formatHeading = (safe: Safe) => (safe.safeName?.trim() ? safe.safeName.trim() : 'Safe');

const formatPhotos = (safe: Safe) => {
  const docs = listByType<Document>('Document').filter(
    (doc) => doc.parentType === 'Safe' && doc.parentId === safe.id
  );
  const labels = docs
    .map((doc) => {
      const name = (doc.name ?? '').trim();
      if (name) {
        const safeName = (safe.safeName ?? '').trim().toLowerCase();
        const lower = name.toLowerCase();
        if (safeName && lower.startsWith(safeName)) {
          return name.slice(safe.safeName!.length).replace(/^[\s-]+/, '').trim() || name;
        }
        return name;
      }
      const related = (doc.requirementRelatedLabel ?? '').trim();
      if (related) return related;
      return 'Photo';
    })
    .filter(Boolean);
  const unique = Array.from(new Set(labels));
  if (!unique.length) return 'No photos yet';
  return unique.join(', ');
};

const formatNotes = (safe: Safe) => {
  const notes = safe.notes?.trim();
  return notes?.length ? notes : 'No notes captured';
};

const SafeMiniCard = ({
  safe,
  onPress,
  onPreview,
  onDelete,
}: {
  safe: Safe;
  onPress?: (safe: Safe) => void;
  onPreview?: (safe: Safe) => void;
  onDelete?: (safe: Safe) => void;
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const heading = formatHeading(safe);
  const photos = formatPhotos(safe);
  const notes = formatNotes(safe);

  const content = (
    <View
      style={[
        styles.targetCard,
        {
          backgroundColor: tones.lightBlue.surface,
          borderColor: tones.lightBlue.border,
        },
      ]}
    >
      <Text style={styles.targetTitle} numberOfLines={2}>
        {heading}
      </Text>
      <Text style={styles.targetMeta} numberOfLines={2}>
        {`Photos: ${photos}`}
      </Text>
      <Text style={styles.targetMeta} numberOfLines={2}>
        {notes}
      </Text>
      <IconButtonGroup spacing={8} style={styles.cardActions}>
        <FloatingIconRoundButton
          buttonType="preview"
          accessibilityLabel="Preview safe"
          onPress={() => onPreview?.(safe)}
          size="sm"
          hitSlop={8}
        />
        <FloatingIconRoundButton
          buttonType="delete"
          accessibilityLabel="Delete safe"
          onPress={() => onDelete?.(safe)}
          size="sm"
          hitSlop={8}
        />
      </IconButtonGroup>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(safe)}
        style={({ pressed }) => [styles.targetPressable, pressed && styles.targetPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const SafeCard: React.FC<SafeCardProps> = ({
  safes,
  onAdd,
  onPressSafe,
  onPreviewSafe,
  onDeleteSafe,
  returnTo,
  style,
}) => {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const encodedReturnTo = useMemo(
    () => (returnTo ? encodeURIComponent(returnTo) : undefined),
    [returnTo]
  );

  const handlePress = (safe: Safe) => {
    if (onPressSafe) {
      onPressSafe(safe);
      return;
    }
    const params: Record<string, string> = { safeId: String(safe.id) };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
    }
    router.push({ pathname: '/safe/wizard', params } as any);
  };

  const handlePreview = (safe: Safe) => {
    if (onPreviewSafe) {
      onPreviewSafe(safe);
      return;
    }
    handlePress(safe);
  };

  const deleteSafeArtifacts = async (safeId: string) => {
    const docs = listByType<Document>('Document').filter(
      (doc) => doc.parentType === 'Safe' && doc.parentId === safeId
    );
    for (const doc of docs) {
      const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
      for (const path of paths) {
        try {
          await deleteOwnedDocFile(path);
        } catch {
          // ignore
        }
      }
      deleteEntity(doc.id);
    }
    deleteEntity(safeId);
  };

  const handleDelete = (safe: Safe) => {
    const doDelete = async () => {
      try {
        await deleteSafeArtifacts(String(safe.id));
      } catch (error) {
        logger.warn('[safe-card] delete safe failed', error);
        Alert.alert('Delete failed', 'Unable to delete this safe. Please try again.');
      }
    };

    if (onDeleteSafe) {
      onDeleteSafe(safe);
      return;
    }

    Alert.alert('Delete safe', 'Are you sure you want to delete this safe and its photos?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const status = safes.length ? `${safes.length} safe${safes.length === 1 ? '' : 's'}` : 'No safes';

  return (
    <DocumentActionCard
      title="Safes"
      status={status}
      statusColor={tones.blue.base}
      actions={[{ label: 'Add', icon: 'add', onPress: onAdd, color: tones.teal.base }]}
      style={style}
    >
      <View style={styles.groupList}>
        {safes.map((safe) => (
          <SafeMiniCard
            key={safe.id}
            safe={safe}
            onPress={handlePress}
            onPreview={handlePreview}
            onDelete={handleDelete}
          />
        ))}
        {safes.length === 0 ? (
          <Text style={styles.emptyHint}>No firearm storage captured yet.</Text>
        ) : null}
      </View>
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    groupList: { gap: 12 },
    emptyHint: {
      color: neutral.base,
      fontSize: 12,
      fontStyle: 'italic',
      alignSelf: 'flex-start',
      marginTop: 4,
    },
    targetPressable: { borderRadius: 14 },
    targetPressed: { opacity: 0.95 },
    targetCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 8,
      backgroundColor: neutral.onBase,
    },
    targetTitle: { fontSize: 15, fontWeight: '700', color: neutral.onSurface, flex: 1 },
    targetMeta: { fontSize: 13, fontWeight: '600', color: neutral.base },
    cardActions: { marginTop: 4, alignSelf: 'flex-end' },
  });

export default SafeCard;
