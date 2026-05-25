import React, { useMemo } from 'react';
import { Alert, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import DocumentActionCard from './DocumentActionCard';
import { useTones } from '../theme/tones';
import { CompetencyCertificate } from '../data/types';
import { competencyCertTypeMap } from '../data/competencyCertTypes';
import { useRouter } from 'expo-router';
import { IconButtonGroup } from './IconButton';
import { FloatingIconRoundButton } from './RoundIconButton';
import { deleteEntity } from '../data/sqlite';
import { deleteEntityDocuments, getActiveApplicationsUsingCertificate, removeCompetencyAssociations } from '../data/entityCleanup';
import { logger } from '@/src/utils/logger';
import { categoryLabel } from '../utils/categoryLabel';
import { useDemoDataResetGuard } from '../demo/useDemoDataResetGuard';

type CompetencyCertificatesCardProps = {
  certificates: CompetencyCertificate[];
  onAdd: () => void;
  onPressCertificate?: (certificate: CompetencyCertificate) => void;
  onPreviewCertificate?: (certificate: CompetencyCertificate) => void;
  onDeleteCertificate?: (certificate: CompetencyCertificate) => void;
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
};

const makeCompetencyToneByCategory = (tones: ReturnType<typeof useTones>) => ({
  Handgun: {
    background: tones.teal.surface,
    border: tones.teal.border,
    text: tones.teal.onSurface,
  },
  Rifle: {
    background: tones.teal.surface,
    border: tones.teal.border,
    text: tones.teal.onSurface,
  },
  Shotgun: {
    background: tones.teal.surface,
    border: tones.teal.border,
    text: tones.teal.onSurface,
  },
  HandMachineCarbine: {
    background: tones.teal.surface,
    border: tones.teal.border,
    text: tones.teal.onSurface,
  },
});

const toneForCompetency = (tones: ReturnType<typeof useTones>, cert?: CompetencyCertificate) => {
  return {
    background: tones.teal.surface,
    border: tones.teal.border,
    text: tones.teal.onSurface,
  };
};

const formatCertificateLabel = (cert: CompetencyCertificate) => {
  const number = cert.certificateNumber?.trim();
  return number || 'Competency certificate';
};

const formatCertificateType = (cert: CompetencyCertificate) => {
  const typeCode = Array.isArray(cert.licenceTypes) ? cert.licenceTypes[0] : undefined;
  if (!typeCode) return 'Licence type not set';
  const label = competencyCertTypeMap[typeCode];
  return label ? `${typeCode}: ${label}` : typeCode;
};

const CompetencyMiniCard = ({
  certificate,
  onPress,
  onPreview,
  onDelete,
}: {
  certificate: CompetencyCertificate;
  onPress?: (certificate: CompetencyCertificate) => void;
  onPreview?: (certificate: CompetencyCertificate) => void;
  onDelete?: (certificate: CompetencyCertificate) => void;
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const tone = toneForCompetency(tones, certificate);
  const competencyToneByCategory = useMemo(() => makeCompetencyToneByCategory(tones), [tones]);
  const categoryCount = certificate.categories?.length ?? 0;
  const label = formatCertificateLabel(certificate);
  const licenceType = formatCertificateType(certificate);
  const content = (
    <View
      style={[
        styles.targetCard,
        { backgroundColor: tone.background, borderColor: tone.border },
      ]}
    >
      <Text style={[styles.targetTitle, { color: tone.text }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.targetType} numberOfLines={2}>
        {licenceType}
      </Text>
      <View style={styles.pills}>
        {categoryCount === 0 ? (
          <Text style={styles.emptyHint}>No categories selected</Text>
        ) : (
          (certificate.categories ?? []).map((cat) => {
            const palette = competencyToneByCategory[cat] ?? {
              background: tones.teal.surface,
              border: tones.teal.border,
              text: tones.teal.onSurface,
            };
            return (
              <View
                key={cat}
                style={[
                  styles.pill,
                  { backgroundColor: neutral.onBase, borderColor: palette.border, borderWidth: 2 },
                ]}
              >
                <Text style={[styles.pillLabel, { color: palette.text }]}>{categoryLabel(cat)}</Text>
              </View>
            );
          })
        )}
      </View>
      <IconButtonGroup spacing={8} style={styles.cardActions}>
        <FloatingIconRoundButton
          buttonType="preview"
          accessibilityLabel="Preview certificate"
          onPress={() => onPreview?.(certificate)}
          size="sm"
          hitSlop={8}
        />
        <FloatingIconRoundButton
          buttonType="delete"
          accessibilityLabel="Delete certificate"
          onPress={() => onDelete?.(certificate)}
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
        onPress={() => onPress(certificate)}
        style={({ pressed }) => [styles.targetPressable, pressed && styles.targetPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const CompetencyCertificatesCard: React.FC<CompetencyCertificatesCardProps> = ({
  certificates,
  onAdd,
  onPressCertificate,
  onPreviewCertificate,
  onDeleteCertificate,
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

  const handlePress = (cert: CompetencyCertificate) => {
    if (onPressCertificate) {
      onPressCertificate(cert);
      return;
    }

    const params: Record<string, string> = { id: String(cert.id) };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }

    router.push({ pathname: '/competency/manual', params } as any);
  };

  const handlePreview = async (cert: CompetencyCertificate) => {
    if (onPreviewCertificate) {
      onPreviewCertificate(cert);
      return;
    }
    const params: Record<string, string> = {
      certificateId: String(cert.id),
      previewMode: '1',
      hideContinue: '1',
      origin: 'competency-card',
    };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }
    router.push({ pathname: '/competency/wizard', params } as any);
  };

  const handleDelete = async (cert: CompetencyCertificate) => {
    if (await guardDemoReset('competency certificate')) return;
    if (onDeleteCertificate) {
      onDeleteCertificate(cert);
      return;
    }

    const impacted = getActiveApplicationsUsingCertificate(cert.id as any);
    const proceed = async () => {
      try {
        await removeCompetencyAssociations(cert.id as any);
        await deleteEntityDocuments('CompetencyCertificate', cert.id as any);
        deleteEntity(cert.id);
      } catch (error) {
        logger.warn('[competency-card] delete certificate failed', error);
        Alert.alert('Delete failed', 'Unable to delete this competency certificate. Please try again.');
      }
    };

    if (!impacted.length) {
      Alert.alert('Delete certificate', 'Are you sure you want to delete this competency certificate?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: proceed },
      ]);
      return;
    }

    const intro =
      impacted.length === 1
        ? 'This certificate is used in 1 application that has not been submitted yet.'
        : `This certificate is used in ${impacted.length} applications that have not been submitted yet.`;
    const details = impacted.map((app) => `• ${formatApplicationLabel(app)}`).join('\n');
    const message = `${intro}\nDeleting it will remove it from the application${impacted.length > 1 ? 's' : ''} and delete related documents.\n\nAffected application${impacted.length > 1 ? 's' : ''}:\n${details}`;

    Alert.alert('Delete certificate', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete anyway', style: 'destructive', onPress: proceed },
    ]);
  };

  const status = certificates.length
    ? `${certificates.length} certificate${certificates.length === 1 ? '' : 's'}`
    : 'No certificates';

  return (
    <DocumentActionCard
      title="Competency certificates"
      status={status}
      statusColor={tones.blue.base}
      actions={[{
        label: 'Add',
        icon: 'add',
        onPress: () => {
          void (async () => {
            if (await guardDemoReset('competency certificate')) return;
            onAdd();
          })();
        },
        color: tones.teal.base,
      }]}
      style={style}
    >
      <View style={styles.groupList}>
        {certificates.map((cert) => (
          <CompetencyMiniCard
            key={cert.id}
            certificate={cert}
            onPress={handlePress}
            onPreview={handlePreview}
            onDelete={(cert) => {
              void handleDelete(cert);
            }}
          />
        ))}
        {certificates.length === 0 ? (
          <Text style={styles.emptyHint}>No competency certificates captured yet.</Text>
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
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
    },
    pillLabel: { fontSize: 13, fontWeight: '700' },
    cardActions: { marginTop: 4, alignSelf: 'flex-end' },
  });

export default CompetencyCertificatesCard;
