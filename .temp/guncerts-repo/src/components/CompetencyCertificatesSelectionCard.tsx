import React, { useMemo } from 'react';
import { GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import DocumentActionCard, { type DocumentIssuePill } from './DocumentActionCard';
import CompetencyCategoryPill from './CompetencyCategoryPill';
import { IconRoundButton } from './RoundIconButton';
import { Ionicons } from '@expo/vector-icons';
import { useTones } from '../theme/tones';
import {
  CompetencyCertificate,
  CompetencyCategory,
  CompetencyExpiryReminderPreference,
  Profile,
} from '../data/types';
import { competencyCertTypeMap } from '../data/competencyCertTypes';
import { getCompetencyReminderVisualState, getDaysUntil } from '../utils/reminderVisuals';
import { getCompetencyCertificateIdsInTerminalApplications } from '../utils/applicationUsage';
import { getCompetencyReminderExpiryDate } from '../utils/competencyExpiry';
import { listByType } from '../data/sqlite';
import { ensureUserPrefs } from '../data/repo';

type Props = {
  certificates: CompetencyCertificate[];
  onAdd: () => void;
  onPressCertificate?: (certificate: CompetencyCertificate) => void;
  onPreviewCertificate?: (certificate: CompetencyCertificate) => void;
  onToggleCertificate?: (certificateId: string) => void;
  onPressDisabledCertificate?: (certificateId: string) => void;
  selectedIds?: Set<string> | string[];
  disabledIds?: Set<string> | string[];
  unselectedTone?: { background: string; border: string };
  returnTo?: string;
  style?: StyleProp<ViewStyle>;
  onHelp?: () => void;
  issuePill?: DocumentIssuePill;
};

const validCategories = new Set<CompetencyCategory>([
  'Handgun',
  'Rifle',
  'Shotgun',
  'HandMachineCarbine',
]);

const categoryLabels: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};

const formatCertificateType = (cert: CompetencyCertificate) => {
  const typeCode = Array.isArray(cert.licenceTypes) ? cert.licenceTypes[0] : undefined;
  if (!typeCode) return 'Licence type not set';
  const label = competencyCertTypeMap[typeCode];
  return label ? `${typeCode}: ${label}` : typeCode;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const isExpired = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() < todayUtc;
};

const CompetencyCertificatesSelectionCard: React.FC<Props> = ({
  certificates,
  onAdd,
  onPressCertificate,
  onPreviewCertificate,
  onToggleCertificate,
  onPressDisabledCertificate,
  selectedIds,
  disabledIds,
  unselectedTone,
  returnTo,
  style,
  onHelp,
  issuePill,
}) => {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const encodedReturnTo = useMemo(
    () => (returnTo ? encodeURIComponent(returnTo) : undefined),
    [returnTo]
  );
  const selectedSet = useMemo<Set<string>>(() => {
    if (selectedIds instanceof Set) return selectedIds;
    if (Array.isArray(selectedIds)) return new Set(selectedIds.map(String));
    return new Set<string>();
  }, [selectedIds]);
  const disabledSet = useMemo<Set<string>>(() => {
    if (disabledIds instanceof Set) return disabledIds;
    if (Array.isArray(disabledIds)) return new Set(disabledIds.map(String));
    return new Set<string>();
  }, [disabledIds]);
  const terminalCompetencyIds = useMemo(
    () => getCompetencyCertificateIdsInTerminalApplications('517g'),
    [certificates]
  );
  const competencyExpiryPreference = useMemo(() => {
    const profileId = listByType<Profile>('Profile')[0]?.id;
    if (!profileId) return 'unknown' as CompetencyExpiryReminderPreference;
    return (ensureUserPrefs(profileId).dfoCompetencyExpiryUsing ?? 'unknown') as CompetencyExpiryReminderPreference;
  }, []);

  const handlePress = (cert: CompetencyCertificate, disabled: boolean) => {
    if (disabled) {
      onPressDisabledCertificate?.(String(cert.id));
      return;
    }
    if (onToggleCertificate) {
      onToggleCertificate(String(cert.id));
      return;
    }
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

  const handlePreview = (cert: CompetencyCertificate) => {
    if (onPreviewCertificate) {
      onPreviewCertificate(cert);
      return;
    }

    const params: Record<string, string> = {
      certificateId: String(cert.id),
      previewMode: '1',
      hideContinue: '1',
      origin: 'competency-selection-card',
    };
    if (encodedReturnTo) {
      params.returnTo = encodedReturnTo;
      params.completeReturnTo = encodedReturnTo;
    }
    router.push({ pathname: '/competency/wizard', params } as any);
  };

  const selectedCount = Array.from(selectedSet).length;
  const status = selectedCount
    ? `${selectedCount} certificate${selectedCount === 1 ? '' : 's'} selected`
    : 'Tap certificate to add it to the application';

  return (
    <DocumentActionCard
      title="Competency certificates"
      status={status}
      statusColor={tones.blue.base}
      issuePill={issuePill}
      actions={[{ label: 'Add', icon: 'add', onPress: onAdd, color: tones.teal.base }]}
      style={style}
      onHelp={onHelp}
    >
      <View style={styles.groupList}>
        {certificates.map((cert) => {
          const headingParts = [
            cert.certificateNumber?.trim() || 'Competency certificate',
          ].filter(Boolean);
          const selected = selectedSet.has(String(cert.id));
          const disabled = disabledSet.has(String(cert.id));
          const reminderExpiryDate = getCompetencyReminderExpiryDate(cert, competencyExpiryPreference);
          const reminderVisual = terminalCompetencyIds.has(String(cert.id))
            ? { label: 'Renewal application created', color: 'green' as const, daysUntil: getDaysUntil(reminderExpiryDate) ?? 0 }
            : getCompetencyReminderVisualState(cert, competencyExpiryPreference);
          const reminderTone =
            reminderVisual?.color === 'red'
              ? tones.red
              : reminderVisual?.color === 'orange'
                ? tones.orange
                : reminderVisual?.color === 'green'
                  ? tones.green
                  : reminderVisual?.color === 'info'
                    ? tones.blue
                  : null;
          const categories = Array.isArray(cert.categories)
            ? cert.categories.filter((c): c is CompetencyCategory => validCategories.has(c as CompetencyCategory))
            : [];
          const pillComponents =
            categories.length === 0
              ? undefined
              : categories.map((cat) => (
                  <CompetencyCategoryPill
                    key={`${cert.id}-${cat}`}
                    category={cat}
                    label={categoryLabels[cat] ?? cat}
                    size="compact"
                    style={reminderTone ? { borderColor: reminderTone.border } : undefined}
                    textStyle={reminderTone ? { color: reminderTone.base } : undefined}
                  />
                ));
          const meta = [formatCertificateType(cert)].filter(Boolean);
          const textColor = disabled
            ? neutral.base
            : reminderTone
              ? reminderTone.base
              : neutral.onSurface;
          const metaColor = disabled
            ? neutral.base
            : reminderTone
              ? reminderTone.base
              : neutral.base;
          const cardBackground = reminderTone
            ? reminderTone.surface
            : disabled
              ? neutral.surface
              : unselectedTone?.background ?? neutral.onBase;
          const cardBorder = reminderTone
            ? reminderTone.border
            : disabled
              ? neutral.border
              : unselectedTone?.border ?? neutral.border;
          const checkStyle = disabled ? styles.checkDisabled : selected ? styles.checkActive : styles.checkIdle;
          return (
            <Pressable
              key={cert.id}
              onPress={() => handlePress(cert, disabled)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: cardBackground, borderColor: cardBorder },
                selected ? styles.cardSelected : null,
                pressed ? styles.cardPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
            >
              {reminderVisual ? (
                <View style={[styles.expiredPill, { backgroundColor: reminderTone?.base }]}>
                  <Text style={styles.expiredPillText}>{reminderVisual.label}</Text>
                </View>
              ) : null}
              <View style={styles.cardTop}>
                <View style={styles.headingWrap}>
                  <Text style={[styles.heading, { color: textColor }]}>{headingParts.join(' • ')}</Text>
                  {meta.map((line, idx) =>
                    line ? (
                      <Text key={`${line}-${idx}`} style={[styles.meta, { color: metaColor }]}>
                        {line}
                      </Text>
                    ) : null
                  )}
                </View>
                <View style={[styles.check, checkStyle]}>
                  {selected ? (
                    <Ionicons name="checkmark" size={16} color={disabled ? neutral.border : tones.teal.onBase} />
                  ) : null}
                </View>
              </View>

              <View style={styles.pills}>
                {pillComponents && pillComponents.length > 0 ? (
                  React.Children.toArray(pillComponents)
                ) : (
                  <Text style={styles.emptyPills}>No categories captured</Text>
                )}
              </View>

              {disabled ? null : (
                <View style={styles.cardFooter}>
                  <IconRoundButton
                    buttonType="preview"
                    size={34}
                    iconSize={18}
                    accessibilityLabel="Preview competency certificate"
                    onPress={(event: GestureResponderEvent) => {
                      event.stopPropagation();
                      handlePreview(cert);
                    }}
                    hitSlop={8}
                  />
                </View>
              )}
            </Pressable>
          );
        })}
        {certificates.length === 0 ? (
          <Text style={styles.emptyHint}>No competency certificates captured yet.</Text>
        ) : null}
      </View>
    </DocumentActionCard>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    groupList: { gap: 12 },
    card: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    cardPressed: {
      opacity: 0.94,
    },
    cardSelected: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.surface,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    headingWrap: {
      flex: 1,
      gap: 4,
    },
    heading: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: neutral.onSurface,
    },
    meta: {
      fontSize: 13,
      color: neutral.base,
      fontWeight: '600',
    },
    check: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    checkIdle: {
      borderColor: tones.purple.border,
      backgroundColor: neutral.onBase,
    },
    checkDisabled: {
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
    },
    checkActive: {
      borderColor: tones.teal.base,
      backgroundColor: tones.teal.base,
    },
    pills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    emptyPills: {
      fontSize: 13,
      color: neutral.base,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    expiredPill: {
      width: '100%',
      backgroundColor: tones.red.base,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    expiredPillText: {
      color: tones.red.onBase,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyHint: {
      color: neutral.base,
      fontSize: 12,
      fontStyle: 'italic',
      alignSelf: 'flex-start',
      marginTop: 4,
    },
  });

export default CompetencyCertificatesSelectionCard;
