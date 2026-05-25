import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTones } from '../theme/tones';
import { FloatingIconRoundButton } from './RoundIconButton';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getShadowColor } from '../theme/effects';
import { Application, CompetencyCategory, CompetencyCertificate, Firearm, RenewalSelection } from '../data/types';
import policy517g from '../policy/517g.json';
import policy518a from '../policy/518a.json';
import { buildLicenceLabelMap } from '../policy/licenceTypes';
import { resolveEffectiveCompetencyCertificateIds, resolveEffectiveFirearmIds } from '../pdf/context';
import { formatFirearmTitle } from '../utils/firearmDisplay';

type CompetencyCertificateMap = Record<string, CompetencyCertificate | undefined>;
type FirearmMap = Record<string, Firearm | undefined>;

type CompetencyLicenceSummary = {
  code: string;
  title: string;
  certificateNumber?: string;
  categories: CompetencyCategory[];
  count: number;
};

const FORM_LABEL: Record<Application['form'], string> = {
  '517': 'New Competency Application (SAPS-517)',
  '517g': 'Competency Certificate Renewal (SAPS-517g)',
  '518a': 'Firearm Licence Renewal (SAPS-518a)',
};

const LICENCE_BY_FORM: Record<Application['form'], Record<string, string>> = {
  '517': {},
  '517g': buildLicenceLabelMap((policy517g as any).licenceTypes),
  '518a': buildLicenceLabelMap((policy518a as any).licenceTypes),
};

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};

const CATEGORY_SORT_ORDER: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];

function compareLicenceCodes(a: string, b: string) {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
    return na - nb;
  }
  return a.localeCompare(b);
}

function compareCompetencyCategory(a: CompetencyCategory, b: CompetencyCategory) {
  const ia = CATEGORY_SORT_ORDER.indexOf(a);
  const ib = CATEGORY_SORT_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1 && ia !== ib) {
    return ia - ib;
  }
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

function buildLicenceHeading(code: string, labels?: Record<string, string>) {
  const label = labels?.[code];
  return label ?? code;
}

function buildCompetencyLicenceSummaries(
  application: Application,
  certificateMap?: CompetencyCertificateMap
): CompetencyLicenceSummary[] {
  if (application.form !== '517g' || !certificateMap) return [];
  const ids = resolveEffectiveCompetencyCertificateIds(application);
  if (!ids.length) return [];

  const accumulator = new Map<
    string,
    { categories: Set<CompetencyCategory>; certIds: Set<string>; certificateNumber?: string }
  >();

  const sortedCertificates = ids
    .map((cid) => certificateMap[cid])
    .filter((cert): cert is CompetencyCertificate => !!cert && cert.type === 'CompetencyCertificate')
    .sort((a, b) => {
      const aCodes = Array.isArray(a.licenceTypes)
        ? a.licenceTypes.map((code) => String(code ?? '').trim()).filter(Boolean)
        : [];
      const bCodes = Array.isArray(b.licenceTypes)
        ? b.licenceTypes.map((code) => String(code ?? '').trim()).filter(Boolean)
        : [];
      const aPrimary = aCodes.sort(compareLicenceCodes)[0] ?? '';
      const bPrimary = bCodes.sort(compareLicenceCodes)[0] ?? '';
      if (!aPrimary && bPrimary) return 1;
      if (aPrimary && !bPrimary) return -1;
      if (aPrimary && bPrimary) {
        const codeCompare = compareLicenceCodes(aPrimary, bPrimary);
        if (codeCompare !== 0) return codeCompare;
      }
      const aNumber = String(a.certificateNumber ?? '').trim();
      const bNumber = String(b.certificateNumber ?? '').trim();
      if (!aNumber && bNumber) return 1;
      if (aNumber && !bNumber) return -1;
      return aNumber.localeCompare(bNumber, undefined, { numeric: true, sensitivity: 'base' });
    });

  sortedCertificates.forEach((cert) => {
    const licenceTypes = Array.isArray(cert.licenceTypes) ? cert.licenceTypes : [];
    const categories = Array.isArray(cert.categories) ? cert.categories : [];
    if (!licenceTypes.length || !categories.length) return;
    licenceTypes.forEach((licenceCode) => {
      const code = String(licenceCode ?? '').trim();
      if (!code) return;
      if (!accumulator.has(code)) {
        accumulator.set(code, {
          categories: new Set<CompetencyCategory>(),
          certIds: new Set<string>(),
          certificateNumber: undefined,
        });
      }
      const bucket = accumulator.get(code)!;
      if (cert.id) bucket.certIds.add(String(cert.id));
      if (!bucket.certificateNumber) {
        const certificateNumber = String(cert.certificateNumber ?? '').trim();
        if (certificateNumber) bucket.certificateNumber = certificateNumber;
      }
      categories.forEach((cat) => {
        if (cat) bucket.categories.add(cat);
      });
    });
  });

  if (!accumulator.size) return [];

  const labelMap = LICENCE_BY_FORM['517g'];
  return Array.from(accumulator.entries())
    .sort(([a], [b]) => compareLicenceCodes(a, b))
    .map(([code, bucket]) => ({
      code,
      title: buildLicenceHeading(code, labelMap),
      certificateNumber: bucket.certificateNumber,
      categories: Array.from(bucket.categories).sort(compareCompetencyCategory),
      count: bucket.certIds.size,
    }));
}

export function licenceLabel(form: Application['form'], code?: string | string[]) {
  if (!code) return undefined;
  const map = LICENCE_BY_FORM[form];
  const toLabel = (c: string) => map?.[c] || c;
  if (Array.isArray(code)) {
    return code.map(toLabel).join(', ');
  }
  return toLabel(code);
}

export function formatRenewalSelections(
  form: Application['form'],
  selections?: RenewalSelection[] | null,
  fallbackCategories?: CompetencyCategory[] | null
) {
  if (Array.isArray(selections) && selections.length) {
    return selections
      .map((sel) => {
        const title = licenceLabel(form, sel.licenceType) ?? sel.licenceType;
        const cats = (sel.categories ?? []).map(
          (cat) => CATEGORY_LABELS[cat] ?? cat
        );
        return `${title}: ${cats.join(', ')}`;
      })
      .join(' | ');
  }
  if (Array.isArray(fallbackCategories) && fallbackCategories.length) {
    return fallbackCategories
      .map((cat) => CATEGORY_LABELS[cat] ?? cat)
      .join(', ');
  }
  return undefined;
}

function statusBadgeTone(status: Application['status'] | undefined, tones: ReturnType<typeof useTones>) {
  switch (status) {
    case 'submitted':
      return { bg: tones.purple.surface, fg: tones.purple.onSurface };
    case 'ready':
      return { bg: tones.green.surface, fg: tones.green.onSurface };
    case 'draft':
    default:
      return { bg: tones.grey.border, fg: tones.grey.base };
  }
}

function cardTone(form: Application['form'], tones: ReturnType<typeof useTones>) {
  return form === '518a'
    ? { bg: tones.blue.surface, border: tones.blue.border, pressedBg: tones.blue.border, pressedBorder: tones.blue.emphasis }
    : { bg: tones.purple.surface, border: tones.purple.border, pressedBg: tones.purple.border, pressedBorder: tones.purple.emphasis };
}

export type ApplicationCardProps = {
  application: Application;
  onPress: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  actionMode?: 'delete' | 'archive';
  competencyCertificates?: CompetencyCertificateMap;
  firearms?: FirearmMap;
  showHeader?: boolean;
  showStatusBadge?: boolean;
  showMetaRow?: boolean;
  showActions?: boolean;
};

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
  onPress,
  onDelete,
  onShare,
  actionMode = 'delete',
  competencyCertificates,
  firearms,
  showHeader = true,
  showStatusBadge = true,
  showMetaRow = true,
  showActions = true,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = useMemo(() => createStyles(neutral, getShadowColor(effectiveMode)), [effectiveMode, neutral]);
  const tone = cardTone(application.form, tones);
  const badge = statusBadgeTone(application.status, tones);
  const competencyTotal = useMemo(() => {
    if (application.form !== '517g') return 0;
    return resolveEffectiveCompetencyCertificateIds(application).length;
  }, [application]);
  const firearmTotal = useMemo(() => {
    if (application.form !== '518a') return 0;
    return resolveEffectiveFirearmIds(application).length;
  }, [application]);
  const baseTitle = FORM_LABEL[application.form];
  const title = baseTitle;
  const rawLicence =
    (application as any).licenceTypes ??
    (application as any).licenseTypes ??
    (application as any).licenseType ??
    (application as any).licenceType;
  const licence = licenceLabel(application.form, rawLicence);
  const updated =
    (application.updatedAt || application.createdAt)
      ? new Date(application.updatedAt || application.createdAt!).toLocaleDateString()
      : '—';

  const selections = (application as any).renewalSelections as
    | RenewalSelection[]
    | undefined;
  const cats = (application as any).renewalCategories as
    | CompetencyCategory[]
    | undefined;
  const categoriesLine = application.form === '517g'
    ? formatRenewalSelections(application.form, selections, cats)
    : undefined;

  const categoryPalette = useMemo(
    () => (category: CompetencyCategory) => {
      switch (category) {
        case 'Handgun':
        case 'Rifle':
        case 'Shotgun':
        case 'HandMachineCarbine':
        default:
          return tones.teal;
      }
    },
    [tones]
  );

  const firearmItems = useMemo(() => {
    if (application.form !== '518a' || !firearms) return [];
    const inline = Array.isArray(application.firearms)
      ? application.firearms.filter((f): f is Firearm => !!f && typeof f === 'object')
      : [];
    const byId = firearms ?? {};
    const seen = new Set<string>();
    const items: Firearm[] = [];
    const push = (firearm?: Firearm) => {
      if (!firearm?.id) return;
      const key = String(firearm.id);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(firearm);
    };

    const selectedIds = resolveEffectiveFirearmIds(application);
    selectedIds.forEach((id) => {
      const fromInline = inline.find((firearm) => String(firearm.id) === id);
      push(fromInline ?? byId[id]);
    });
    inline.forEach((firearm) => push(firearm));
    return items;
  }, [application, firearms]);

  const firearmGroups = useMemo(() => {
    if (!firearmItems.length) return [];
    const groups = new Map<string, { section: string; pills: Array<{ id: string; label: string; tone: { border: string } }> }>();
    const sortedFirearms = [...firearmItems].sort((a, b) => {
      const sectionA = String(a.section ?? '').trim();
      const sectionB = String(b.section ?? '').trim();
      const sectionNumberA = Number.parseFloat(sectionA);
      const sectionNumberB = Number.parseFloat(sectionB);
      const sectionRankA = Number.isFinite(sectionNumberA) ? sectionNumberA : Number.POSITIVE_INFINITY;
      const sectionRankB = Number.isFinite(sectionNumberB) ? sectionNumberB : Number.POSITIVE_INFINITY;
      if (sectionRankA !== sectionRankB) return sectionRankA - sectionRankB;
      const sectionNameCompare = sectionA.localeCompare(sectionB, undefined, { sensitivity: 'base' });
      if (sectionNameCompare !== 0) return sectionNameCompare;
      const firearmTypeA = String(a.firearmType ?? '').trim();
      const firearmTypeB = String(b.firearmType ?? '').trim();
      const firearmTypeCompare = firearmTypeA.localeCompare(firearmTypeB, undefined, { sensitivity: 'base' });
      if (firearmTypeCompare !== 0) return firearmTypeCompare;
      const makeA = String(a.make ?? '').trim();
      const makeB = String(b.make ?? '').trim();
      const makeCompare = makeA.localeCompare(makeB, undefined, { sensitivity: 'base' });
      if (makeCompare !== 0) return makeCompare;
      const modelA = String(a.model ?? '').trim();
      const modelB = String(b.model ?? '').trim();
      return modelA.localeCompare(modelB, undefined, { sensitivity: 'base' });
    });
    sortedFirearms.forEach((firearm) => {
      const rawSection = (firearm.section ?? '').trim();
      const section = rawSection ? `${rawSection} firearm` : 'Section not set';
      const label = formatFirearmTitle(firearm);
      const paletteKey = (() => {
        switch (firearm.firearmType) {
          case 'Handgun':
            return 'Handgun';
          case 'Rifle':
            return 'Rifle';
          case 'Shotgun':
            return 'Shotgun';
          default:
            return 'HandMachineCarbine';
        }
      })();
      const palette = categoryPalette(paletteKey);
      const tone = {
        background: neutral.onBase,
        border: palette.base,
        text: palette.base,
      };
      if (!groups.has(section)) {
        groups.set(section, { section, pills: [] });
      }
      groups.get(section)!.pills.push({ id: String(firearm.id), label, tone: { border: tone.border } });
    });
    return Array.from(groups.values());
  }, [firearmItems]);

  const competencySummaries = useMemo(
    () => buildCompetencyLicenceSummaries(application, competencyCertificates),
    [application, competencyCertificates]
  );
  const newCompetencyCategories517 = useMemo(() => {
    if (application.form !== '517') return [];
    const selected = Array.isArray((application as any)?.form517?.sectionD?.possessFirearmCompetencies)
      ? ((application as any).form517.sectionD.possessFirearmCompetencies as CompetencyCategory[])
      : [];
    const deduped = Array.from(new Set(selected.filter(Boolean)));
    return deduped.sort(compareCompetencyCategory);
  }, [application]);
  const showCompetencySummaries = competencySummaries.length > 0 || (application.form === '517' && newCompetencyCategories517.length > 0);
  const shareStyle = {
    tone: 'green' as const,
    backgroundColor: tones.green.base,
    pressedBackgroundColor: tones.green.emphasis,
    iconColor: tones.green.onBase,
  };
  const archiveStyle =
    actionMode === 'archive'
      ? {
          tone: 'orange' as const,
          backgroundColor: tones.orange.base,
          pressedBackgroundColor: tones.orange.emphasis,
          iconColor: tones.orange.onBase,
        }
      : {
          tone: 'red' as const,
          backgroundColor: tones.red.base,
          pressedBackgroundColor: tones.red.emphasis,
          iconColor: tones.red.onBase,
        };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? tone.pressedBg : tone.bg,
          borderColor: pressed ? tone.pressedBorder : tone.border,
        },
      ]}
      accessibilityRole="button"
    >
      {showHeader ? (
        <View style={styles.cardTop}>
          <Text style={[styles.title, styles.titleFlex]} numberOfLines={2}>
            {title}
          </Text>
          {showStatusBadge ? (
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.fg }]}>{application.status ?? 'draft'}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {showCompetencySummaries ? (
        <View style={styles.competencySection}>
          {application.form === '517' ? (
            <View style={styles.competencyBlock}>
              <Text style={styles.competencySubheading}>Competency to Possess Firearm</Text>
              {newCompetencyCategories517.length ? (
                <View style={styles.competencyPills}>
                  {newCompetencyCategories517.map((category) => {
                    const palette = categoryPalette(category);
                    return (
                      <View
                        key={`517-${category}`}
                        style={[
                          styles.competencyCategoryPill,
                          { borderColor: palette.base, backgroundColor: neutral.onBase },
                        ]}
                      >
                        <Text style={[styles.competencyCategoryLabel, { color: palette.base }]}>
                          {CATEGORY_LABELS[category] ?? category}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.competencyEmpty}>No categories captured</Text>
              )}
            </View>
          ) : null}
          {competencySummaries.map((summary) => (
            <View key={summary.code} style={styles.competencyBlock}>
              <Text style={styles.competencySubheading}>
                {summary.certificateNumber ? `${summary.title} (${summary.certificateNumber})` : summary.title}
              </Text>
              {summary.categories.length ? (
                <View style={styles.competencyPills}>
                  {summary.categories.map((category) => {
                    const palette = categoryPalette(category);
                    return (
                      <View
                        key={`${summary.code}-${category}`}
                        style={[
                          styles.competencyCategoryPill,
                          { borderColor: palette.base, backgroundColor: neutral.onBase },
                        ]}
                      >
                        <Text style={[styles.competencyCategoryLabel, { color: palette.base }]}>
                          {CATEGORY_LABELS[category] ?? category}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.competencyEmpty}>No categories captured</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <>
          {licence ? <Text style={styles.subtitle}>{licence}</Text> : null}
          {application.form === '518a' && firearmGroups.length ? (
            <View style={styles.firearmGroups}>
              {firearmGroups.map((group) => (
                <View key={group.section} style={styles.firearmGroup}>
                  <Text style={styles.firearmGroupHeading}>{group.section}</Text>
                  <View style={styles.firearmPills}>
                    {group.pills.map((pill) => (
                      <View
                        key={pill.id}
                        style={[
                          styles.firearmPill,
                          { backgroundColor: neutral.onBase, borderColor: pill.tone.border },
                        ]}
                      >
                        <Text style={[styles.firearmPillText, { color: pill.tone.border }]}>
                          {pill.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {categoriesLine ? (
            <Text style={styles.meta}>Categories: {categoriesLine}</Text>
          ) : null}
        </>
      )}

      {showMetaRow ? (
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Ionicons name="calendar-outline" size={14} color={neutral.base} />
            <Text style={styles.metaText}>Updated: {updated}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={neutral.border} />
        </View>
      ) : null}
      {showActions && (onShare || onDelete) ? (
        <View style={styles.actionRow}>
          {onShare ? (
            <FloatingIconRoundButton
              buttonType="share"
              accessibilityLabel="Share application"
              onPress={(e) => {
                e.stopPropagation?.();
                onShare();
              }}
              size={32}
              hitSlop={8}
            />
          ) : null}
          {onDelete ? (
            <FloatingIconRoundButton
              buttonType={actionMode === 'archive' ? 'archive' : 'delete'}
              accessibilityLabel={actionMode === 'archive' ? 'Archive application' : 'Delete application'}
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete();
              }}
              size={32}
              hitSlop={8}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], shadowColor: string) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      padding: 14,
      gap: 6,
      shadowColor,
      shadowOpacity: 0.03,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 1 },
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: neutral.onSurface, fontWeight: '800', fontSize: 16 },
    titleFlex: { flex: 1, paddingRight: 8 },
    subtitle: { color: neutral.onSurface, fontWeight: '600' },
    meta: { color: neutral.base },
    competencySection: { marginTop: 6, gap: 14 },
    competencyBlock: { gap: 6 },
    competencySubheading: { fontWeight: '700', color: neutral.onSurface, fontSize: 15 },
    competencyPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    competencyCategoryPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    competencyCategoryLabel: { fontWeight: '500' },
    competencyEmpty: { color: neutral.base, fontStyle: 'italic' },
    firearmGroups: { gap: 10 },
    firearmGroup: { gap: 6 },
    firearmGroupHeading: { fontWeight: '700', color: neutral.onSurface, fontSize: 14, paddingTop: 6 },
    firearmPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    firearmPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: '100%',
      alignSelf: 'flex-start',
    },
    firearmPillText: { fontWeight: '600', flexShrink: 1 },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexShrink: 0,
      alignSelf: 'flex-start',
      marginLeft: 8,
    },
    badgeText: { fontSize: 12, fontWeight: '800' },
    metaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { color: neutral.base },
    actionRow: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      flexDirection: 'row',
      gap: 8,
    },
  });

export const FORM_LABEL_MAP = FORM_LABEL;
