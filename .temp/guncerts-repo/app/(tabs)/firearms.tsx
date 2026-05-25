import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { appConfig } from '../../src/config/appConfig';
import Screen from '../../src/components/Screen';
import TabScrollView from '../../src/components/TabScrollView';
import FirearmsSection from '../../src/components/FirearmsSection';
import FirearmStorageSection from '../../src/components/FirearmStorageSection';
import ActivityEvidenceSection from '../../src/components/ActivityEvidenceSection';
import { useTones } from '../../src/theme/tones';
import { TAB_SPACING } from '../../src/theme/spacing';
import { deleteEntity, listByType } from '../../src/data/sqlite';
import { ActivityEvidence, Application, Document, Firearm, Profile, Safe } from '../../src/data/types';
import {
  deleteEntityDocuments,
  getActiveApplicationsUsingFirearm,
  getActiveApplicationsUsingSafe,
  removeFirearmAssociations,
  removeSafeAssociations,
} from '../../src/data/entityCleanup';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { persist, touch } from '../../src/data/repo';
import { useCollapsedPanels } from '../../src/hooks/useCollapsedPanels';
import { logger } from '@/src/utils/logger';
import { recalculateAndPersistCompetencyExpiries } from '../../src/utils/competencyExpiry';
import { resolveWizardRoute } from '../../src/navigation/helpers';
import { useDemoDataResetGuard } from '../../src/demo/useDemoDataResetGuard';
import { getReminderVisualState } from '../../src/utils/reminderVisuals';
import { getFirearmIdsInTerminalApplications } from '../../src/utils/applicationUsage';
import { prepareReminderRenewalDocuments } from '../../src/utils/reminderRenewalDocuments';
import { resolveActiveReminderApplications } from '../../src/utils/reminderApplicationResolution';
import { compareFirearmsByReminderPriority } from '../../src/utils/reminderSort';
import { compareFirearms } from '../../src/utils/firearmSort';
import {
  buildReminderCompletedListRoute,
  prepareReminderCompletedApplication,
} from '../../src/utils/reminderCompletedApplication';

const formatApplicationLabel = (app: Application) => {
  const formLabel = app.form === '517g'
    ? 'SAPS 517g'
    : app.form === '518a'
      ? 'SAPS 518a'
      : 'Application';
  const statusLabel = app.status === 'ready'
    ? 'ready'
    : app.status === 'draft'
      ? 'draft'
      : app.status;
  return `${formLabel} (${statusLabel ?? 'unknown'})`;
};

const formatImpactedAppsMessage = (
  apps: Application[],
  subject: string,
  effect: string
) => {
  if (!apps.length) return null;
  const intro = apps.length === 1
    ? `This ${subject} is used in 1 application that has not been submitted yet.`
    : `This ${subject} is used in ${apps.length} applications that have not been submitted yet.`;
  const details = apps.map(app => `• ${formatApplicationLabel(app)}`).join('\n');
  const suffix = `${effect}\n\nAffected application${apps.length > 1 ? 's' : ''}:\n${details}`;
  return `${intro}\n${suffix}`;
};

const normalizeId = (value: unknown) => `${value ?? ''}`.trim();
const isDraftOrReady = (status?: string | null) => status === 'draft' || status === 'ready';

const stripDocIdsFromApplication = (app: Application, targetIds: Set<string>): Application | null => {
  let changed = false;
  let nextDocs = app.docs;

  if (targetIds.has(normalizeId(app.checklistDocumentId))) {
    changed = true;
  }

  if (app.docs?.documents?.length) {
    const filtered = app.docs.documents.filter(
      (entry) => !targetIds.has(normalizeId(entry.documentId))
    );
    if (filtered.length !== app.docs.documents.length) {
      changed = true;
      nextDocs = { ...app.docs, documents: filtered };
    }
  }

  if (!changed) return null;

  return touch({
    ...app,
    docs: nextDocs,
    checklistDocumentId: targetIds.has(normalizeId(app.checklistDocumentId)) ? undefined : app.checklistDocumentId,
  } as Application);
};

export default function FirearmsTab() {
  const router = useRouter();
  const { scroll } = useLocalSearchParams<{ scroll?: 'firearms' | 'safes' | 'activityEvidence' }>();
  const [tick, setTick] = useState(0);
  const scrollRef = useRef<any>(null);
  const firearmsTop = useRef(0);
  const safesTop = useRef(0);
  const activityEvidenceTop = useRef(0);
  const tabConfig = appConfig.tabs;
  const firearmsTab = tabConfig.firearms ?? {};
  const firearmsTitle = firearmsTab.label ?? 'Firearms';
  const profileId = useMemo(() => listByType<Profile>('Profile')[0]?.id ?? null, [tick]);
  const { collapsed, setSectionCollapsed } = useCollapsedPanels('firearms', [
    'FirearmsSection',
    'FirearmStorageSection',
    'ActivityEvidenceSection',
  ]);
  const [firearmsOpen, setFirearmsOpen] = useState(!collapsed.FirearmsSection);
  const [firearmsRender, setFirearmsRender] = useState(!collapsed.FirearmsSection);
  const firearmsRotate = useRef(new Animated.Value(1)).current;
  const firearmsOpacity = useRef(new Animated.Value(1)).current;
  const [safesOpen, setSafesOpen] = useState(!collapsed.FirearmStorageSection);
  const [safesRender, setSafesRender] = useState(!collapsed.FirearmStorageSection);
  const safesRotate = useRef(new Animated.Value(1)).current;
  const safesOpacity = useRef(new Animated.Value(1)).current;
  const [activityEvidenceOpen, setActivityEvidenceOpen] = useState(!collapsed.ActivityEvidenceSection);
  const [activityEvidenceRender, setActivityEvidenceRender] = useState(!collapsed.ActivityEvidenceSection);
  const activityEvidenceRotate = useRef(new Animated.Value(1)).current;
  const activityEvidenceOpacity = useRef(new Animated.Value(1)).current;
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);
  const guardDemoReset = useDemoDataResetGuard();

  useFocusEffect(
    useCallback(() => {
      setTick(t => t + 1);
    }, [])
  );

  const scrollToSection = useCallback(() => {
    if (!scrollRef.current || !scroll) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const y = scroll === 'firearms'
          ? firearmsTop.current
          : scroll === 'safes'
            ? safesTop.current
            : activityEvidenceTop.current;
        scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: false });
      });
    });
  }, [scroll]);

  useEffect(() => {
    scrollToSection();
  }, [scrollToSection]);

  useFocusEffect(
    useCallback(() => {
      scrollToSection();
    }, [scrollToSection])
  );

  const terminalFirearmIds = useMemo(() => getFirearmIdsInTerminalApplications('518a'), [tick]);
  const firearms = useMemo(
    () =>
      listByType<Firearm>('Firearm')
        .slice()
        .sort((a, b) =>
          compareFirearmsByReminderPriority(a, b, {
            terminalIds: terminalFirearmIds,
            compareBase: compareFirearms,
          }),
        ),
    [terminalFirearmIds, tick],
  );
  const documents = useMemo(() => listByType<Document>('Document'), [tick]);
  const safes = useMemo(() => {
    const all = listByType<Safe>('Safe');
    const filtered = profileId ? all.filter(s => !s.holderProfileId || s.holderProfileId === profileId) : all;
    return filtered
      .slice()
      .sort((a, b) => {
        const an = (a.safeName ?? '').toLowerCase();
        const bn = (b.safeName ?? '').toLowerCase();
        return an.localeCompare(bn);
      });
  }, [profileId, tick]);
  const activityEvidenceItems = useMemo(() => {
    const all = listByType<ActivityEvidence>('ActivityEvidence');
    const filtered = profileId
      ? all.filter((item) => String(item.holderProfileId ?? '') === String(profileId) && !item.deleted)
      : all.filter((item) => !item.deleted);
    const map = new Map<ActivityEvidence['evidenceType'], ActivityEvidence>();
    filtered.forEach((item) => {
      map.set(item.evidenceType, item);
    });
    return map;
  }, [profileId, tick]);

  const findApplicationsReferencingDocs = useCallback((docIds: string[]) => {
    const targets = new Set(docIds.map(normalizeId));
    return listByType<Application>('Application').filter(app => {
      if (!isDraftOrReady(app.status)) return false;
      if (targets.has(normalizeId(app.checklistDocumentId))) return true;
      const docs = app.docs?.documents ?? [];
      return docs.some((entry) => targets.has(normalizeId(entry.documentId)));
    });
  }, []);

  const purgeDocsFromApplications = useCallback((docIds: string[]) => {
    const targets = new Set(docIds.map(normalizeId));
    const apps = listByType<Application>('Application');
    let updated = 0;
    for (const app of apps) {
      const next = stripDocIdsFromApplication(app, targets);
      if (next) {
        persist(next);
        updated += 1;
      }
    }
    return updated;
  }, []);

  const openSection = useCallback(
    (
      sectionKey: string,
      setOpen: (next: boolean) => void,
      setRender: (next: boolean) => void,
      rotation: Animated.Value,
      opacity: Animated.Value,
    ) => {
      setOpen(true);
      setSectionCollapsed(sectionKey, false);
      setRender(true);
      Animated.parallel([
        Animated.timing(rotation, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    },
    [setSectionCollapsed],
  );

  const makeToggle = (
    open: boolean,
    setOpen: (v: boolean) => void,
    setRender: (v: boolean) => void,
    rotation: Animated.Value,
    opacity: Animated.Value,
    sectionKey: string,
  ) => () => {
    const next = !open;
    setOpen(next);
    setSectionCollapsed(sectionKey, !next);
    if (next) setRender(true);
    Animated.parallel([
      Animated.timing(rotation, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished && !next) setRender(false);
    });
  };

  const openFirearmsSection = useCallback(
    () => openSection('FirearmsSection', setFirearmsOpen, setFirearmsRender, firearmsRotate, firearmsOpacity),
    [firearmsOpacity, firearmsRotate, openSection],
  );

  const openSafesSection = useCallback(
    () => openSection('FirearmStorageSection', setSafesOpen, setSafesRender, safesRotate, safesOpacity),
    [openSection, safesOpacity, safesRotate],
  );
  const openActivityEvidenceSection = useCallback(
    () =>
      openSection(
        'ActivityEvidenceSection',
        setActivityEvidenceOpen,
        setActivityEvidenceRender,
        activityEvidenceRotate,
        activityEvidenceOpacity,
      ),
    [activityEvidenceOpacity, activityEvidenceRotate, openSection],
  );

  const handleDeleteFirearm = useCallback(async (id: string) => {
    try {
      await removeFirearmAssociations(id);
      await deleteEntityDocuments('Firearm', id);
      deleteEntity(id);
      recalculateAndPersistCompetencyExpiries();
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[firearms] Failed to delete firearm', error);
      Alert.alert('Delete failed', 'Unable to delete this firearm. Please try again.');
    }
  }, []);

  const confirmDeleteFirearm = useCallback(async (id: string) => {
    if (await guardDemoReset('firearm')) return;
    const impacted = getActiveApplicationsUsingFirearm(id);
    const proceed = () => { void handleDeleteFirearm(id); };

    if (!impacted.length) {
      Alert.alert('Delete firearm', 'Are you sure you want to delete this firearm?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: proceed },
      ]);
      return;
    }

    const intro = impacted.length === 1
      ? 'This firearm is used in 1 application that has not been submitted yet.'
      : `This firearm is used in ${impacted.length} applications that have not been submitted yet.`;
    const details = impacted
      .map(app => `• ${formatApplicationLabel(app)}`)
      .join('\n');
    const message = `${intro}\nDeleting it will remove it from the application${impacted.length > 1 ? 's' : ''} and delete related documents.\n\nAffected application${impacted.length > 1 ? 's' : ''}:\n${details}`;

    Alert.alert(
      'Delete firearm',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete anyway', style: 'destructive', onPress: proceed },
      ],
    );
  }, [guardDemoReset, handleDeleteFirearm]);

  const handleAddFirearm = useCallback(async () => {
    if (await guardDemoReset('firearm')) return;
    router.push({
      pathname: '/firearms/wizard',
      params: { returnTo: encodeURIComponent('/(tabs)/firearms') },
    } as any);
  }, [guardDemoReset, router]);

  const openFirearm = useCallback((id: string) => {
    const firearm = firearms.find((item) => String(item.id) === String(id));
    const reminderVisual = firearm
      ? terminalFirearmIds.has(String(firearm.id))
        ? { label: 'Renewal application created', color: 'green' as const }
        : getReminderVisualState('firearm', firearm.validTo)
      : null;

    if (firearm && (reminderVisual?.color === 'red' || reminderVisual?.color === 'orange')) {
      const activeResolution = resolveActiveReminderApplications('firearm', String(id));
      const renewMessage =
        activeResolution.kind === 'none'
          ? 'Do you want to view this firearm licence or start a renewal application?'
          : activeResolution.kind === 'single'
            ? 'A renewal application for this firearm licence is already in progress. Do you want to view the firearm licence or open the renewal?'
            : 'More than one renewal application for this firearm licence is already in progress. Do you want to view the firearm licence or choose a renewal to open?';
      const renewLabel =
        activeResolution.kind === 'none'
          ? 'Start renewal'
          : activeResolution.kind === 'single'
            ? 'Open renewal'
            : 'Choose renewal';
      Alert.alert(
        'Firearm licence',
        renewMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: renewLabel,
            onPress: () => {
              try {
                const result = prepareReminderRenewalDocuments('firearm', String(id), '/(tabs)/firearms?scroll=firearms');
                if (result.kind === 'multiple') {
                  const hasReady = result.applications.some((app) => app.status === 'ready');
                  const hasDraft = result.applications.some((app) => app.status === 'draft');
                  const listNav = encodeURIComponent(JSON.stringify({
                    returnTo: '/(tabs)/firearms?scroll=firearms',
                    routeBack: '/(tabs)/firearms?scroll=firearms',
                    origin: '/(tabs)/firearms?scroll=firearms',
                    clearRouteBackHistory: true,
                  }));
                  Alert.alert(
                    'Choose renewal',
                    'More than one active renewal application already includes this item. Open the relevant application list and choose which one to continue.',
                    [
                      ...(hasDraft
                        ? [{ text: 'Open draft applications', onPress: () => router.push({ pathname: '/application/existing', params: { nav: listNav } } as any) }]
                        : []),
                      ...(hasReady
                        ? [{ text: 'Open ready applications', onPress: () => router.push({ pathname: '/application/ready', params: { nav: listNav } } as any) }]
                        : []),
                      { text: 'Cancel', style: 'cancel' },
                    ],
                  );
                  return;
                }
                router.push(result.route as any);
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Could not open the renewal application.';
                Alert.alert('Unable to continue', message);
              }
            },
          },
          {
            text: 'View',
            onPress: () =>
              router.push({
                pathname: '/firearms/wizard',
                params: {
                  firearmId: id,
                  returnTo: encodeURIComponent('/(tabs)/firearms'),
                  origin: 'manual',
                },
              } as any),
          },
        ],
      );
      return;
    }

    if (firearm && reminderVisual?.color === 'green') {
      Alert.alert(
        'Completed renewal',
        'Do you want to view the completed application?',
        [
          {
            text: 'No',
            onPress: () =>
              router.push({
                pathname: '/firearms/wizard',
                params: {
                  firearmId: id,
                  returnTo: encodeURIComponent('/(tabs)/firearms'),
                  origin: 'manual',
                },
              } as any),
          },
          {
            text: 'Yes',
            onPress: () => {
              try {
                const result = prepareReminderCompletedApplication(
                  'firearm',
                  String(id),
                  '/(tabs)/firearms?scroll=firearms',
                );
                if (result.kind === 'multiple') {
                  const hasSubmitted = result.applications.some((app) => app.status === 'submitted');
                  const hasArchived = result.applications.some((app) => app.status === 'archived');
                  Alert.alert(
                    'Choose completed application',
                    'More than one completed renewal application already includes this item. Open the relevant application list and choose which one to continue.',
                    [
                      ...(hasSubmitted
                        ? [{ text: 'Open completed applications', onPress: () => router.push(buildReminderCompletedListRoute('submitted', '/(tabs)/firearms?scroll=firearms') as any) }]
                        : []),
                      ...(hasArchived
                        ? [{ text: 'Open archived applications', onPress: () => router.push(buildReminderCompletedListRoute('archived', '/(tabs)/firearms?scroll=firearms') as any) }]
                        : []),
                      { text: 'Cancel', style: 'cancel' },
                    ],
                  );
                  return;
                }
                if (result.kind === 'none') {
                  router.push({
                    pathname: '/firearms/wizard',
                    params: {
                      firearmId: id,
                      returnTo: encodeURIComponent('/(tabs)/firearms'),
                      origin: 'manual',
                    },
                  } as any);
                  return;
                }
                router.push(result.route as any);
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Could not open the completed application.';
                Alert.alert('Unable to continue', message);
              }
            },
          },
        ],
      );
      return;
    }

    router.push({
      pathname: '/firearms/wizard',
      params: {
        firearmId: id,
        returnTo: encodeURIComponent('/(tabs)/firearms'),
        origin: 'manual',
      },
    } as any);
  }, [firearms, router, terminalFirearmIds]);

  const openFirearmEditor = useCallback((firearmId: string) => {
    router.push({
      pathname: '/firearms/wizard',
      params: {
        firearmId,
        returnTo: encodeURIComponent('/(tabs)/firearms'),
        origin: 'manual',
      },
    } as any);
  }, [router]);

  const openSafeWizard = useCallback((safeId?: string) => {
    void (async () => {
      if (!safeId && (await guardDemoReset('safe'))) return;
      const resolved = resolveWizardRoute('safe', 'firearms');
      if (!resolved) return;
      const params: Record<string, string> = {
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
          origin: resolved.routeBack,
        }),
      };
      if (safeId) params.safeId = safeId;
      router.replace({ pathname: resolved.routeTo as any, params } as any);
    })();
  }, [router]);

  const openActivityEvidenceWizard = useCallback(
    (evidenceType: ActivityEvidence['evidenceType']) => {
      const resolved = resolveWizardRoute('activityEvidence', 'firearms');
      if (!resolved) return;
      const existing = activityEvidenceItems.get(evidenceType);
      const params: Record<string, string> = {
        evidenceType,
        nav: JSON.stringify({
          routeBack: resolved.routeBack,
          returnTo: resolved.routeBack,
          onComplete: resolved.routeBack,
          clearRouteBackHistory: resolved.clearRouteBackHistory,
          origin: resolved.routeBack,
        }),
      };
      if (existing?.id) params.activityEvidenceId = String(existing.id);
      router.replace({ pathname: resolved.routeTo as any, params } as any);
    },
    [activityEvidenceItems, router],
  );

  const handleDeleteSafe = useCallback(async (safeId: string) => {
    try {
      await removeSafeAssociations(safeId);
      const docs = listByType<Document>('Document').filter(
        d => d.parentType === 'Safe' && d.parentId === safeId
      );
      const docIds = docs.map(doc => normalizeId(doc.id));
      if (docIds.length) {
        purgeDocsFromApplications(docIds);
      }
      for (const doc of docs) {
        const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
        for (const path of paths) {
          try { await deleteOwnedDocFile(path); } catch { }
        }
        deleteEntity(doc.id);
      }
      deleteEntity(safeId);
      setTick(t => t + 1);
    } catch (error) {
      logger.warn('[firearms] Failed to delete safe', error);
      Alert.alert('Delete failed', 'Unable to delete this safe. Please try again.');
    }
  }, [purgeDocsFromApplications]);

  const confirmDeleteSafe = useCallback(async (safeId: string) => {
    if (await guardDemoReset('safe')) return;
    const docs = listByType<Document>('Document').filter(
      d => d.parentType === 'Safe' && d.parentId === safeId
    );
    const docIds = docs.map(doc => normalizeId(doc.id));
    const affectedAppsFromDocs = docIds.length ? findApplicationsReferencingDocs(docIds) : [];
    const impactedByLink = getActiveApplicationsUsingSafe(safeId);
    const uniqueApps = [...new Map([...affectedAppsFromDocs, ...impactedByLink].map(app => [app.id, app])).values()];
    const warning = formatImpactedAppsMessage(
      uniqueApps,
      'safe and its photos',
      'Deleting it will remove its photos from the application.'
    );
    Alert.alert(
      'Delete safe',
      warning ?? 'Are you sure you want to delete this safe and its photos?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void handleDeleteSafe(safeId); } },
      ],
    );
  }, [findApplicationsReferencingDocs, getActiveApplicationsUsingSafe, guardDemoReset, handleDeleteSafe]);

  return (
    <Screen>
      <TabScrollView contentContainerStyle={styles.content} ref={scrollRef}>
        <Text style={styles.h1}>Your Vault</Text>
        <FirearmsSection
          firearms={firearms}
          disableTopMargin
          open={firearmsOpen}
          render={firearmsRender}
          rotation={firearmsRotate}
          opacity={firearmsOpacity}
          onToggle={makeToggle(
            firearmsOpen,
            setFirearmsOpen,
            setFirearmsRender,
            firearmsRotate,
            firearmsOpacity,
            'FirearmsSection'
          )}
          onExpand={openFirearmsSection}
          onAdd={() => {
            void handleAddFirearm();
          }}
          onPressItem={openFirearm}
          onEditItem={openFirearmEditor}
          onDeleteItem={(id) => {
            void confirmDeleteFirearm(id);
          }}
          title="Your firearms"
          onLayout={(e) => { firearmsTop.current = e.nativeEvent.layout.y; }}
        />
        <FirearmStorageSection
          safes={safes}
          documents={documents}
          showDivider
          open={safesOpen}
          render={safesRender}
          rotation={safesRotate}
          opacity={safesOpacity}
          onToggle={makeToggle(
            safesOpen,
            setSafesOpen,
            setSafesRender,
            safesRotate,
            safesOpacity,
            'FirearmStorageSection'
          )}
          onExpand={openSafesSection}
          onAdd={() => openSafeWizard()}
          onEdit={(id) => openSafeWizard(id)}
          onDelete={(id) => {
            void confirmDeleteSafe(id);
          }}
          onLayout={(e) => { safesTop.current = e.nativeEvent.layout.y; }}
        />
        <ActivityEvidenceSection
          itemsByType={activityEvidenceItems}
          onOpenType={openActivityEvidenceWizard}
          showDivider
          open={activityEvidenceOpen}
          render={activityEvidenceRender}
          rotation={activityEvidenceRotate}
          opacity={activityEvidenceOpacity}
          onToggle={makeToggle(
            activityEvidenceOpen,
            setActivityEvidenceOpen,
            setActivityEvidenceRender,
            activityEvidenceRotate,
            activityEvidenceOpacity,
            'ActivityEvidenceSection',
          )}
          onExpand={openActivityEvidenceSection}
          onLayout={(e) => {
            activityEvidenceTop.current = e.nativeEvent.layout.y;
          }}
        />
      </TabScrollView>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    content: {
      // paddingBottom: 24,
      gap: TAB_SPACING,
    },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: TAB_SPACING },
  });
