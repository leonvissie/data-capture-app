import React, { useMemo } from 'react';
import { Alert, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import DocumentActionCard from './DocumentActionCard';
import { useTones } from '../theme/tones';
import { Firearm } from '../data/types';
import { useRouter } from 'expo-router';
import { IconButtonGroup } from './IconButton';
import { FloatingIconRoundButton } from './RoundIconButton';
import { deleteEntity } from '../data/sqlite';
import { logger } from '@/src/utils/logger';
import { recalculateAndPersistCompetencyExpiries } from '../utils/competencyExpiry';
import {
  deleteEntityDocuments,
  getActiveApplicationsUsingFirearm,
  removeFirearmAssociations,
} from '../data/entityCleanup';
import { categoryLabel } from '../utils/categoryLabel';
import { useDemoDataResetGuard } from '../demo/useDemoDataResetGuard';
import { formatFirearmLicenceLine, formatFirearmTitle } from '../utils/firearmDisplay';

type FirearmsCardProps = {
  firearms: Firearm[];
  onAdd: () => void;
  onPressFirearm?: (firearm: Firearm) => void;
  onPreviewFirearm?: (firearm: Firearm) => void;
  onDeleteFirearm?: (firearm: Firearm) => void;
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
};

const toneForFirearm = (tones: ReturnType<typeof useTones>, firearm?: Firearm) => {
  const primary = firearm?.firearmType;
  return {
    background: tones.orange.surface,
    border: tones.orange.border,
    text: tones.orange.base,
  };
};

const formatHeading = (firearm: Firearm) => formatFirearmTitle(firearm);

const formatTypeAction = (firearm: Firearm) => {
  const type = firearm.firearmType ? categoryLabel(firearm.firearmType) : 'Type not set';
  const action =
    firearm.firearmAction === 'Other'
      ? firearm.firearmActionOther || 'Other'
      : firearm.firearmAction;
  return action ? `${type} (${action})` : type;
};

const FirearmMiniCard = ({
  firearm,
  onPress,
  onPreview,
  onDelete,
}: {
  firearm: Firearm;
  onPress?: (firearm: Firearm) => void;
  onPreview?: (firearm: Firearm) => void;
  onDelete?: (firearm: Firearm) => void;
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const tone = toneForFirearm(tones, firearm);
  const heading = formatHeading(firearm);
  const typeAction = formatTypeAction(firearm);
  const licence = formatFirearmLicenceLine(firearm);

  const content = (
    <View
      style={[
        styles.targetCard,
        { backgroundColor: tone.background, borderColor: tone.border },
      ]}
    >
      <Text style={[styles.targetTitle, { color: tone.text }]} numberOfLines={2}>
        {heading}
      </Text>
      <Text style={styles.targetType} numberOfLines={2}>
        {typeAction}
      </Text>
      <Text style={styles.targetType} numberOfLines={2}>
        {licence}
      </Text>
      <IconButtonGroup spacing={8} style={styles.cardActions}>
        <FloatingIconRoundButton
          buttonType="preview"
          accessibilityLabel="Preview firearm documents"
          onPress={() => onPreview?.(firearm)}
          size="sm"
          hitSlop={8}
        />
        <FloatingIconRoundButton
          buttonType="delete"
          accessibilityLabel="Delete firearm"
          onPress={() => onDelete?.(firearm)}
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
        onPress={() => onPress(firearm)}
        style={({ pressed }) => [styles.targetPressable, pressed && styles.targetPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const FirearmsCard: React.FC<FirearmsCardProps> = ({
  firearms,
  onAdd,
  onPressFirearm,
  onPreviewFirearm,
  onDeleteFirearm,
  returnTo,
  style,
}) => {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const encodedReturnTo = useMemo(
    () => (returnTo ? encodeURIComponent(returnTo) : undefined),
    [returnTo]
  );
  const guardDemoReset = useDemoDataResetGuard();

  const formatApplicationLabel = (app: { form?: string | null; status?: string | null }) => {
    const formLabel = app.form === '517g' ? 'SAPS 517g' : app.form === '518a' ? 'SAPS 518a' : 'Application';
    const statusLabel = app.status === 'ready' ? 'ready' : app.status === 'draft' ? 'draft' : app.status ?? 'unknown';
    return `${formLabel} (${statusLabel})`;
  };

  const handlePress = (firearm: Firearm) => {
    if (onPressFirearm) {
      onPressFirearm(firearm);
      return;
    }

    const params: Record<string, string> = { id: String(firearm.id) };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }

    router.push({ pathname: '/firearms/manual', params } as any);
  };

  const handlePreview = (firearm: Firearm) => {
    if (onPreviewFirearm) {
      onPreviewFirearm(firearm);
      return;
    }
    const params: Record<string, string> = {
      firearmId: String(firearm.id),
      previewMode: '1',
      hideContinue: '1',
      origin: 'firearms-card',
    };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }
    router.push({ pathname: '/firearms/wizard', params } as any);
  };

  const handleDelete = async (firearm: Firearm) => {
    if (await guardDemoReset('firearm')) return;
    if (onDeleteFirearm) {
      onDeleteFirearm(firearm);
      return;
    }

    const impacted = getActiveApplicationsUsingFirearm(firearm.id as any);
    const proceed = async () => {
      try {
        await removeFirearmAssociations(firearm.id as any);
        await deleteEntityDocuments('Firearm', firearm.id as any);
        deleteEntity(firearm.id);
        recalculateAndPersistCompetencyExpiries();
      } catch (error) {
        logger.warn('[firearms-card] delete firearm failed', error);
        Alert.alert('Delete failed', 'Unable to delete this firearm. Please try again.');
      }
    };

    if (!impacted.length) {
      Alert.alert('Delete firearm', 'Are you sure you want to delete this firearm?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: proceed },
      ]);
      return;
    }

    const intro =
      impacted.length === 1
        ? 'This firearm is used in 1 application that has not been submitted yet.'
        : `This firearm is used in ${impacted.length} applications that have not been submitted yet.`;
    const details = impacted.map((app) => `• ${formatApplicationLabel(app)}`).join('\n');
    const message = `${intro}\nDeleting it will remove it from the application${impacted.length > 1 ? 's' : ''} and delete related documents.\n\nAffected application${impacted.length > 1 ? 's' : ''}:\n${details}`;

    Alert.alert('Delete firearm', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete anyway', style: 'destructive', onPress: proceed },
    ]);
  };

  const status = firearms.length
    ? `${firearms.length} firearm${firearms.length === 1 ? '' : 's'}`
    : 'No firearms';

  return (
    <DocumentActionCard
      title="Firearms"
      status={status}
      statusColor={tones.blue.base}
      actions={[{
        label: 'Add',
        icon: 'add',
        onPress: () => {
          void (async () => {
            if (await guardDemoReset('firearm')) return;
            onAdd();
          })();
        },
        color: tones.teal.base,
      }]}
      style={style}
    >
      <View style={styles.groupList}>
        {firearms.map((firearm) => (
          <FirearmMiniCard
            key={firearm.id}
            firearm={firearm}
            onPress={handlePress}
            onPreview={handlePreview}
            onDelete={(firearm) => {
              void handleDelete(firearm);
            }}
          />
        ))}
        {firearms.length === 0 ? (
          <Text style={styles.emptyHint}>No firearms captured yet.</Text>
        ) : null}
      </View>
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
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
    targetType: { fontSize: 13, fontWeight: '600', color: neutral.base },
    cardActions: { marginTop: 4, alignSelf: 'flex-end' },
  });

export default FirearmsCard;
