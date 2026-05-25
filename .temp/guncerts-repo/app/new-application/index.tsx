import React from 'react';
import { View, StyleSheet, Text, Alert, Linking } from 'react-native';
import Screen from '../../src/components/Screen';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ApplicationCard, {
  ApplicationCardProps,
  ApplicationCardStatus,
} from './ApplicationCard';
import applicationsPolicy from '../../src/policy/applications.json';
import { useTones } from '../../src/theme/tones';
import { backOrReplace, normalizeReturnTo } from '../../src/utils/navigation';
import { decodeNav, resolveDocumentsNav, buildDocumentsRoute } from '../../src/navigation/helpers';
import { listByType } from '../../src/data/sqlite';
import { Application, Profile, Document } from '../../src/data/types';
import { withMeta, persist } from '../../src/data/repo';
import { seedDocsFor } from '../../src/config/docSeed';
import { linkExistingProfileProofs } from '../../src/utils/profileProofs';
import { isDemoDatasetActive } from '../../src/demo/demoState';

type PolicyCard = {
  key: string;
  label: string;
  form?: string;
  subLabel: string;
  status: ApplicationCardStatus;
  type?: 'screen' | 'url';
  target?: string;
};

type PolicyColorTokens = {
  label: string;
  background: string;
  border: string;
};

const resolvePressedToken = (token: string): string => {
  if (!token) return token;
  if (token.startsWith('tones.') && token.endsWith('.base')) {
    return token.replace(/\.base$/, '.emphasis');
  }
  if (token.startsWith('tones.') && token.endsWith('.surface')) {
    return token.replace(/\.surface$/, '.border');
  }
  if (token.startsWith('tones.neutrals.')) {
    return 'tones.neutrals.200';
  }
  return token;
};

type PolicyApplicationType = {
  title?: string;
  status?: 'active' | 'hidden';
  colors: PolicyColorTokens;
  cards: Record<string, PolicyCard>;
};

type ApplicationPolicy = {
  disabledColors: PolicyColorTokens;
  applicationTypes: Record<string, PolicyApplicationType>;
};

const policy = applicationsPolicy as ApplicationPolicy;

const resolveToneToken = (
  token: string,
  tones: ReturnType<typeof useTones>,
): string => {
  if (!token) return '';
  if (token.startsWith('#')) return token;

  const [group, name, shade] = token.split('.');
  if (group !== 'tones') return token;
  const tone = (tones as any)[name];
  if (!tone) return token;
  if (typeof tone === 'string') return tone;
  const key = shade ?? (name === 'neutrals' ? '0' : 'base');
  return (tone as any)[key] ?? (tone as any).base ?? token;
};

const docIdType = (doc?: Document): Profile['idType'] | undefined => {
  if (!doc) return undefined;
  const kind = `${doc.kind ?? ''}`.toUpperCase();
  if (kind.includes('PASSPORT')) return 'PASSPORT';
  if (kind.includes('BOOK')) return 'ID_BOOK';
  return 'ID_CARD';
};

export default function NewApplicationChooser() {
  const tones = useTones();
  const styles = React.useMemo(() => createStyles(tones.grey), [tones.grey]);
  const resolveColorToken = React.useCallback(
    (token: string) => resolveToneToken(token, tones),
    [tones],
  );
  const resolveColors = React.useCallback(
    (tokens: PolicyColorTokens): ApplicationCardProps['cardColors'] => ({
      label: resolveColorToken(tokens.label),
      background: resolveColorToken(tokens.background),
      border: resolveColorToken(tokens.border),
      pressedBackground: resolveColorToken(resolvePressedToken(tokens.background)),
      pressedBorder: resolveColorToken(resolvePressedToken(tokens.border)),
    }),
    [resolveColorToken],
  );
  const router = useRouter();
  const params = useLocalSearchParams<{ originReturnTo?: string | string[] }>();
  const [creatingKey, setCreatingKey] = React.useState<string | null>(null);
  const navCtx = React.useMemo(() => {
    const normalized = normalizeReturnTo(params.originReturnTo, undefined as any) as string | undefined;
    return decodeNav({ returnTo: normalized });
  }, [params.originReturnTo]);
  const goToApplications = React.useCallback(() => {
    backOrReplace(router, navCtx.returnTo || '/(tabs)' as any);
  }, [navCtx.returnTo, router]);
  const applicationTypeEntries = React.useMemo(() => {
    const entries = Object.entries(policy.applicationTypes).filter(
      ([, config]) => config.status !== 'hidden',
    );
    return entries.sort(([a], [b]) => {
      if (a === 'renewal') {
        return -1;
      }
      if (b === 'renewal') {
        return 1;
      }

      return a.localeCompare(b);
    });
  }, [policy.applicationTypes]);
  const disabledCardColors = React.useMemo(
    () => resolveColors(policy.disabledColors),
    [policy.disabledColors, resolveColors],
  );
  const ensureProfile = React.useCallback((): Profile | null => {
    const existing = listByType<Profile>('Profile');
    if (existing.length) return existing[0];
    const created: Profile = withMeta<Profile>({
      id: (globalThis.crypto?.randomUUID?.() ?? `prof_${Math.random().toString(36).slice(2)}`) as any,
      type: 'Profile',
    } as any);
    persist(created);
    return created;
  }, []);
  const handleComingSoon = React.useCallback(
    async (card: PolicyCard) => {
      const target = (card.target ?? '').trim();
      if (card.type === 'screen' && target) {
        router.push(target as any);
        return;
      }
      if (card.type === 'url' && target) {
        const supported = await Linking.canOpenURL(target);
        if (!supported) {
          Alert.alert('Link unavailable', 'This link could not be opened on this device.');
          return;
        }
        await Linking.openURL(target);
        return;
      }
      Alert.alert('Coming soon', 'This application type is not available yet. Please check back soon.');
    },
    [router],
  );

  const getLatestProfileIdType = React.useCallback((): Profile['idType'] | null => {
    const profile = ensureProfile();
    if (!profile?.id) return null;
    const docs = listByType<Document>('Document').filter(
      d => d.parentType === 'Profile' && String(d.parentId ?? '') === String(profile.id) && (d.kind === 'ID_CARD' || d.kind === 'ID_BOOK' || d.kind === 'PASSPORT')
    );
    if (!docs.length) return null;
    const latest = docs
      .slice()
      .sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || '');
        const tb = Date.parse(b.updatedAt || b.createdAt || '');
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      })[0];
    return docIdType(latest) ?? null;
  }, [ensureProfile]);

  const createAndOpenApplication = React.useCallback(
    (card: PolicyCard, options?: { demoModeActive?: boolean }) => {
      const key = (card.key || '').toLowerCase();
      if (key !== '517g' && key !== '518a' && key !== '517') {
        Alert.alert('Not supported', 'This application type is not available yet.');
        return;
      }
      if (creatingKey) return;
      setCreatingKey(key);
      try {
        const profile = ensureProfile();
        const latestIdDocType = getLatestProfileIdType();
        if (profile?.idType && latestIdDocType && profile.idType !== latestIdDocType) {
          Alert.alert(
            'ID type mismatch',
            `Your profile ID type is set to ${profile.idType}, but your latest ID upload looks like a ${latestIdDocType}. Update your profile or recapture matching photos to avoid delays.`
          );
        }
        const appId =
          (globalThis.crypto?.randomUUID?.() ?? `app_${Math.random().toString(36).slice(2)}`) as any;
        const base: Application = withMeta<Application>({
          id: appId,
          type: 'Application',
          form: key as any,
          applicationType: key === '517' ? 'new' : 'renewal',
          status: 'draft',
          ...(options?.demoModeActive ? { userConfirmedAccuracy: false } : {}),
          paymentReceived: false,
          applicantProfileId: profile?.id,
          selectedFirearmIds: [],
          membershipIds: [],
          requireMembership: false,
          competencyCertificateIds: [],
          safeIds: [],
        } as any);
        const docs =
          key === '517'
            ? undefined
            : linkExistingProfileProofs(seedDocsFor(base, profile), profile);
        const nextApp: Application = { ...base, docs } as any;
        persist(nextApp as any);
        const nav = resolveDocumentsNav('newApplication', { id: appId }, { origin: navCtx.returnTo || '/new-application' });
        const { pathname, params } = buildDocumentsRoute({
          id: appId,
          mode: 'new',
          nav,
        });
        router.replace({ pathname, params } as any);
      } finally {
        setCreatingKey(null);
      }
    },
    [creatingKey, ensureProfile, getLatestProfileIdType, navCtx.returnTo, router],
  );

  const confirmCreateApplication = React.useCallback(
    async (card: PolicyCard) => {
      const demoModeActive = await isDemoDatasetActive();
      if (demoModeActive) {
        createAndOpenApplication(card, { demoModeActive: true });
        return;
      }

      const lines: string[] = [
        'By continuing, you confirm that:',
        '',
        '- All information and documents you provide are truthful and accurate.',
        '- No relevant information has been intentionally omitted.',
        '- You are creating this application for yourself and not on behalf of someone else.',
        '- You accept responsibility for the completeness and correctness of the captured data.',
        '',
        'By continuing, you agree to the above and our terms and conditions.',
      ];

      Alert.alert(
        'Before you continue',
        lines.join('\n'),
        [
          { text: 'Return', style: 'cancel' },
          { text: 'Continue', style: 'default', onPress: () => createAndOpenApplication(card) },
        ],
      );
    },
    [createAndOpenApplication],
  );

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Create application"
          onClose={goToApplications}
          style={styles.header}
        />

        <PageScrollView contentContainerStyle={styles.content}>
          {applicationTypeEntries.map(([typeKey, config]) => {
            const palette = resolveColors(config.colors);

            return (
              <View key={typeKey} style={styles.section}>
                {config.title ? (
                  <Text style={styles.sectionTitle}>{config.title}</Text>
                ) : null}
                {Object.values(config.cards)
                  .filter((card) => card.status !== 'hidden')
                  .map((card) => {
                    const isComingSoon = card.status === 'comingSoon';
                    const handleCardPress = async () => {
                      if (isComingSoon) {
                        await handleComingSoon(card);
                        return;
                      }
                      confirmCreateApplication(card);
                    };

                    return (
                      <ApplicationCard
                        key={card.key}
                        label={card.label}
                        subLabel={card.subLabel}
                        form={card.form}
                        status={card.status}
                        cardColors={palette}
                        disabledCardColors={disabledCardColors}
                        onPress={handleCardPress}
                      />
                    );
                  })}
              </View>
            );
          })}
        </PageScrollView>
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    content: { gap: 16, paddingBottom: 24 },
    section: { gap: 12 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: neutral.base,
    },
  });
