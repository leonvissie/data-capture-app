import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import Screen from '../../src/components/Screen';
import { useTones } from '../../src/theme/tones';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { withMeta, persist, touch } from '../../src/data/repo';
import { listByType, getById } from '../../src/data/sqlite';
import { CompetencyCertificate, Profile, CompetencyCategory, Document, Extraction } from '../../src/data/types';
import { EditTextSheet, SelectSheet } from '../../src/components/EditSheet';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import PageHeader from '../../src/components/PageHeader';
import PageScrollView from '../../src/components/PageScrollView';
import { performDocumentExtraction, getExtractionForDocument } from '../../src/ocr';
import { mapCompetencyExtraction } from '../../src/ocr/mappers';
import { parseArrayParam } from '../../src/utils/queryParams';
import { competencyCertTypes, competencyCertTypeMap } from '../../src/data/competencyCertTypes';
import ButtonSave from '../../src/components/ButtonSave';
import { useDevMode } from '../../src/providers/DevModeProvider';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { appConfig } from '../../src/config/appConfig';
import { useDemoDataResetGuard } from '../../src/demo/useDemoDataResetGuard';

const CATS: CompetencyCategory[] = ['Handgun', 'Rifle', 'Shotgun', 'HandMachineCarbine'];
const CERT_TYPE_OPTIONS = competencyCertTypes.map((option) => ({
  value: option.code,
  label: `${option.code}: ${option.label}`,
}));

const formatCertificateTypeLabel = (code?: string | null) => {
  if (!code) return undefined;
  const label = competencyCertTypeMap[code];
  return label ? `${code}: ${label}` : code;
};

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand Machine Carbine',
};

const createCategoryColors = (tones: ReturnType<typeof useTones>) => ({
  Handgun: {
    background: tones.teal.surface,
    border: tones.teal.border,
    activeBorder: tones.teal.base,
    text: tones.teal.onSurface,
    activeText: tones.teal.onSurface,
  },
  Rifle: {
    background: tones.green.surface,
    border: tones.green.border,
    activeBorder: tones.green.base,
    text: tones.green.base,
    activeText: tones.green.base,
  },
  Shotgun: {
    background: tones.blue.surface,
    border: tones.blue.border,
    activeBorder: tones.blue.base,
    text: tones.blue.base,
    activeText: tones.blue.base,
  },
  HandMachineCarbine: {
    background: tones.orange.surface,
    border: tones.orange.border,
    activeBorder: tones.orange.base,
    text: tones.orange.base,
    activeText: tones.orange.base,
  },
});

type Draft = {
  categories: CompetencyCategory[];
  licenceTypeCode: string;
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string;
  trainingProvider: string;
  isCurrent: boolean;
};

type DraftField = keyof Draft;

const FIELD_LABELS: Record<DraftField, string> = {
  categories: 'Categories',
  licenceTypeCode: 'Certificate type',
  certificateNumber: 'Certificate number',
  issuedAt: 'Issued date',
  expiresAt: 'Expiry date',
  trainingProvider: 'Training provider',
  isCurrent: 'Current status',
};

const createEmptyDraft = (): Draft => ({
  categories: [],
  licenceTypeCode: '',
  certificateNumber: '',
  issuedAt: '',
  expiresAt: '',
  trainingProvider: '',
  isCurrent: true,
});

const cloneDraft = (draft: Draft): Draft => ({
  ...draft,
  categories: [...draft.categories],
});

const draftFromCertificate = (cert: CompetencyCertificate): Draft => ({
  categories: [...(cert.categories ?? [])],
  licenceTypeCode: Array.isArray(cert.licenceTypes) && cert.licenceTypes.length ? cert.licenceTypes[0] ?? '' : '',
  certificateNumber: cert.certificateNumber ?? '',
  issuedAt: cert.issuedAt ?? '',
  expiresAt: cert.expiresAt ?? '',
  trainingProvider: cert.trainingProvider ?? '',
  isCurrent: cert.isCurrent ?? true,
});

const normalizeString = (value?: string | null) => (value ?? '').trim();
const normalizeForCompare = (value?: string | null) => normalizeString(value).toLowerCase();

const categoriesEqual = (a: CompetencyCategory[], b: CompetencyCategory[]) => {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((val, idx) => val === bs[idx]);
};

type SheetKey = 'certificateNumber' | 'issuedAt' | 'expiresAt' | 'trainingProvider';

type SheetState =
  | null
  | { type: 'text'; key: SheetKey; title: string; mask?: 'date' }
  | { type: 'select'; key: 'certificateType'; title: string };

export default function ManualCompetencyScreen() {
  const router = useRouter();
  const guardDemoReset = useDemoDataResetGuard();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const categoryColors = useMemo(() => createCategoryColors(tones), [tones]);
  const { devModeEnabled } = useDevMode();
  const validationEnabled = appConfig.features.enableValidation && !devModeEnabled;
  const duplicateChecksEnabled = appConfig.features.duplicateChecks;
  const params = useLocalSearchParams<{
    nav?: string | string[];
    docId?: string | string[];
    id?: string | string[];
    returnTo?: string | string[];
    fromWizard?: string | string[];
    selectedCertIds?: string | string[];
    selectionParam?: string | string[];
    completeReturnTo?: string | string[];
    intro?: string | string[];
    forceOverwrite?: string | string[];
  }>();
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const docId = useMemo(() => {
    const raw = params.docId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.docId]);

  const id = useMemo(() => {
    const raw = params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.id]);

  const cameFromWizard = useMemo(() => {
    const raw = Array.isArray(params.fromWizard) ? params.fromWizard[0] : params.fromWizard;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'wizard';
  }, [params.fromWizard]);
  const selectionParam = useMemo(() => {
    const raw = Array.isArray(params.selectionParam) ? params.selectionParam[0] : params.selectionParam;
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value || 'selectedCertIds';
  }, [params.selectionParam]);
  const forceOverwrite = useMemo(() => {
    const raw = Array.isArray(params.forceOverwrite) ? params.forceOverwrite[0] : params.forceOverwrite;
    if (!raw) return false;
    const norm = `${raw}`.trim().toLowerCase();
    return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'force';
  }, [params.forceOverwrite]);
  const seededSelection = useMemo(
    () => parseArrayParam(params.selectedCertIds),
    [params.selectedCertIds],
  );
  const ensureSelectionWith = useCallback(
    (nextId?: string | null) => {
      const base = new Set(seededSelection);
      if (nextId) base.add(String(nextId));
      return Array.from(base);
    },
    [seededSelection],
  );

  const navPayload = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }, [params.nav]);
  const navCtx = useMemo(
    () =>
      decodeNav({
        ...(navPayload ?? {}),
        returnTo: Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
        onComplete: Array.isArray(params.completeReturnTo) ? params.completeReturnTo[0] : params.completeReturnTo,
      }),
    [navPayload, params.completeReturnTo, params.returnTo]
  );
  const baseReturnPath = navCtx.routeBack || navCtx.onComplete || navCtx.returnTo || '/(tabs)/profile?scroll=competency';
  const introFlag = useMemo(() => {
    const raw = Array.isArray(params.intro) ? params.intro[0] : params.intro;
    return raw ? `${raw}` : null;
  }, [params.intro]);

  const wizardReturnParam = useMemo(() => {
    const base = baseReturnPath ?? '/(tabs)/profile?scroll=competency';
    const [path, query = ''] = base.split('?');
    const search = new URLSearchParams(query);
    if (introFlag) search.set('intro', introFlag);
    const next = search.toString() ? `${path}?${search.toString()}` : path;
    return encodeURIComponent(next);
  }, [baseReturnPath, introFlag]);

  const [existing, setExisting] = useState<CompetencyCertificate | null>(null);
  const [initialDraft, setInitialDraft] = useState<Draft>(createEmptyDraft());
  const [draft, setDraft] = useState<Draft>(createEmptyDraft());

  const [sheet, setSheet] = useState<SheetState>(null);
  const [editingInitial, setEditingInitial] = useState<string>('');
  const [docRecord, setDocRecord] = useState<Document | null>(null);
  const [ocrExtraction, setOcrExtraction] = useState<Extraction | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extractionApplied, setExtractionApplied] = useState(false);
  const showDevDiagnostics = devModeEnabled && !!docRecord;

  const attachDocumentToCertificate = useCallback(
    (certId: string) => {
      if (!docId) return;
      const doc = getById<Document>(String(docId));
      if (!doc) return;
      if (doc.parentType === 'CompetencyCertificate' && doc.parentId === certId) return;
      const updated = touch({
        ...doc,
        parentType: 'CompetencyCertificate',
        parentId: certId,
      } as Document);
      persist(updated);
    },
    [docId],
  );

  useEffect(() => {
    if (id) {
      const cx = getById<CompetencyCertificate>(String(id));
      if (cx) {
        setExisting(cx);
        const base = draftFromCertificate(cx);
        setInitialDraft(base);
        setDraft(cloneDraft(base));
        return;
      }
    }

    setExisting(null);
    const base = createEmptyDraft();
    setInitialDraft(base);
    setDraft(cloneDraft(base));
  }, [id]);

  useEffect(() => {
    if (!docId) {
      setDocRecord(null);
      setOcrExtraction(null);
      setOcrError(null);
      setOcrStatus('idle');
      setExtractionApplied(false);
      return;
    }
    const doc = getById<Document>(String(docId));
    setDocRecord(doc ?? null);
    if (doc) {
      const existingExtraction = getExtractionForDocument(doc);
      setOcrExtraction(existingExtraction);
      setOcrError(existingExtraction?.errorMessage ?? null);
      setExtractionApplied(false);
    } else {
      setOcrExtraction(null);
      setOcrError(null);
      setExtractionApplied(false);
    }
    setOcrStatus('idle');
  }, [docId]);

  useEffect(() => {
    if (!docRecord) return;
    if (ocrStatus !== 'idle') return;
    const shouldRetry = ocrExtraction?.errorCode === 'MLKIT_MODULE_MISSING';
    if (ocrExtraction && !shouldRetry) return;

    setOcrStatus('running');
    setOcrError(null);
    (async () => {
      try {
        const extraction = await performDocumentExtraction(docRecord, {
          extractionType: 'CompetencyCertificate',
          force: shouldRetry,
        });
        if (!isMounted.current) return;
        if (extraction) {
          setOcrExtraction(extraction);
          setOcrError(extraction.errorMessage ?? null);
        } else {
          setOcrError(null);
          setExtractionApplied(true);
        }
      } catch (error: any) {
        if (!isMounted.current) return;
        setOcrError(error?.message ?? 'Unable to extract data from this document.');
      } finally {
        if (isMounted.current) setOcrStatus('done');
      }
    })();
  }, [docRecord, ocrExtraction, ocrStatus]);

  useEffect(() => {
    if (!ocrExtraction) return;
    if (extractionApplied) return;
    if (ocrExtraction.extractionType !== 'CompetencyCertificate') {
      setExtractionApplied(true);
      return;
    }
    const partial = mapCompetencyExtraction(ocrExtraction);
    if (forceOverwrite) {
      const nextDraft = {
        ...createEmptyDraft(),
        certificateNumber: partial.certificateNumber ?? '',
        issuedAt: partial.issuedAt ?? '',
        expiresAt: partial.expiresAt ?? '',
        trainingProvider: partial.trainingProvider ?? '',
        licenceTypeCode: partial.licenceTypeCode ?? '',
        categories: partial.categories ? [...partial.categories] : [],
      };
      setDraft(nextDraft);
      setInitialDraft(createEmptyDraft());
      setExtractionApplied(true);
      return;
    }

    let mutated = false;

    setDraft(prev => {
      let next = prev;

      if (!prev.certificateNumber && partial.certificateNumber) {
        next = next === prev ? { ...prev } : next;
        next.certificateNumber = partial.certificateNumber;
        mutated = true;
      }
      if (!prev.issuedAt && partial.issuedAt) {
        next = next === prev ? { ...prev } : next;
        next.issuedAt = partial.issuedAt;
        mutated = true;
      }
      if (!prev.expiresAt && partial.expiresAt) {
        next = next === prev ? { ...prev } : next;
        next.expiresAt = partial.expiresAt;
        mutated = true;
      }
      if (!prev.trainingProvider && partial.trainingProvider) {
        next = next === prev ? { ...prev } : next;
        next.trainingProvider = partial.trainingProvider;
        mutated = true;
      }
      if ((prev.categories?.length ?? 0) === 0 && partial.categories && partial.categories.length) {
        if (next === prev) {
          next = { ...prev, categories: [...partial.categories] };
        } else {
          next = { ...next, categories: [...partial.categories] };
        }
        mutated = true;
      }
      if (!prev.licenceTypeCode && partial.licenceTypeCode) {
        next = next === prev ? { ...prev } : next;
        next.licenceTypeCode = partial.licenceTypeCode;
        mutated = true;
      }

      if (!mutated) return prev;
      return next;
    });

    if (mutated) {
      setInitialDraft(prev => {
        const next = { ...prev };
        if (partial.certificateNumber) next.certificateNumber = partial.certificateNumber;
        if (partial.issuedAt) next.issuedAt = partial.issuedAt;
        if (partial.expiresAt) next.expiresAt = partial.expiresAt;
        if (partial.trainingProvider) next.trainingProvider = partial.trainingProvider;
        if (partial.categories && partial.categories.length) next.categories = [...partial.categories];
        if (partial.licenceTypeCode) next.licenceTypeCode = partial.licenceTypeCode;
        return next;
      });
    }
    setExtractionApplied(true);
  }, [extractionApplied, forceOverwrite, ocrExtraction]);

  const goReturn = useCallback(
    (ids?: string[]) => {
      const routeBackTarget = navCtx.routeBack || baseReturnPath || '/(tabs)/profile?scroll=competency';

      const ensured = routeBackTarget.startsWith('/') ? routeBackTarget : `/${routeBackTarget}`;
      const [base, query = ''] = ensured.split('?');
      const search = new URLSearchParams(query);
      const finalIds = ids ?? seededSelection;
      if (finalIds.length) {
        search.set(selectionParam, JSON.stringify(finalIds));
      } else {
        search.delete(selectionParam);
      }
      if (introFlag) {
        search.set('intro', introFlag);
      }
      const target = search.toString() ? `${base}?${search.toString()}` : base;
      if (cameFromWizard) {
        router.replace(target as any);
        return;
      }
      const ctx = { ...navCtx, routeBack: target, returnTo: target };
      backOrReplaceWithContext(router as any, ctx as any, target as any);
    },
    [baseReturnPath, cameFromWizard, introFlag, navCtx, router, seededSelection, selectionParam],
  );

  const handlePostSave = useCallback(
    (saved: CompetencyCertificate | null, wasExisting: boolean) => {
      const nextIds = saved?.id ? ensureSelectionWith(saved.id) : seededSelection;
      if (cameFromWizard && !wasExisting && saved?.id) {
        Alert.alert(
          'Add another certificate?',
          'Do you want to add another competency certificate now?',
          [
            { text: 'No', style: 'cancel', onPress: () => goReturn(nextIds) },
            {
              text: 'Yes',
              onPress: () => {
                void (async () => {
                  if (await guardDemoReset('competency certificate')) return;
                  router.replace({
                    pathname: '/competency/wizard',
                    params: {
                      returnTo: wizardReturnParam,
                      completeReturnTo: wizardReturnParam,
                      selectedCertIds: JSON.stringify(nextIds),
                      selectionParam,
                      intro: introFlag ?? undefined,
                      nav: encodeURIComponent(
                        JSON.stringify({
                          ...navCtx,
                          routeBack: baseReturnPath ?? '/(tabs)/profile?scroll=competency',
                        })
                      ),
                    },
                  } as any);
                })();
              },
            },
          ],
        );
        return;
      }
      goReturn(nextIds);
    },
    [baseReturnPath, cameFromWizard, ensureSelectionWith, goReturn, guardDemoReset, introFlag, navCtx, router, seededSelection, selectionParam, wizardReturnParam],
  );

  const openEditor = useCallback(
    (key: SheetKey, title: string, mask?: 'date') => {
      setEditingInitial(draft[key] ?? '');
      setSheet({ type: 'text', key, title, mask });
    },
    [draft],
  );

  const onSaveEditor = useCallback(
    (value: string) => {
      if (!sheet || sheet.type !== 'text') return;
      const nextValue = sheet.mask === 'date' ? value.trim() : value;
      setDraft(prev => ({ ...prev, [sheet.key]: nextValue }));
      setSheet(null);
    },
    [sheet],
  );

  const toggleCat = useCallback((category: CompetencyCategory) => {
    setDraft(prev => {
      const hasCat = prev.categories.includes(category);
      return {
        ...prev,
        categories: hasCat ? prev.categories.filter(c => c !== category) : [...prev.categories, category],
      };
    });
  }, []);

  const openCertificateTypeSheet = useCallback(() => {
    setSheet({ type: 'select', key: 'certificateType', title: 'Certificate type' });
  }, []);

  const onPickCertificateType = useCallback((value: string) => {
    setDraft(prev => ({ ...prev, licenceTypeCode: value }));
    setSheet(null);
  }, []);

  const validateDateISO = (value: string) => {
    if (!value) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  };

  const ensureProfile = useCallback((): Profile => {
    const prof = listByType<Profile>('Profile')[0];
    if (prof) return prof;
    const created = withMeta<Profile>({
      id: globalThis.crypto?.randomUUID?.() ?? `prof_${Math.random().toString(36).slice(2)}`,
      type: 'Profile',
    } as any);
    persist(created);
    return created;
  }, []);

  const changedFields = useMemo(() => {
    const diffs: DraftField[] = [];
    if (!categoriesEqual(draft.categories, initialDraft.categories)) diffs.push('categories');
    if (normalizeString(draft.licenceTypeCode) !== normalizeString(initialDraft.licenceTypeCode)) diffs.push('licenceTypeCode');
    if (normalizeString(draft.certificateNumber) !== normalizeString(initialDraft.certificateNumber)) diffs.push('certificateNumber');
    if (normalizeString(draft.issuedAt) !== normalizeString(initialDraft.issuedAt)) diffs.push('issuedAt');
    if (normalizeString(draft.expiresAt) !== normalizeString(initialDraft.expiresAt)) diffs.push('expiresAt');
    if (normalizeString(draft.trainingProvider) !== normalizeString(initialDraft.trainingProvider)) diffs.push('trainingProvider');
    if (draft.isCurrent !== initialDraft.isCurrent) diffs.push('isCurrent');
    return diffs;
  }, [draft, initialDraft]);

  const changedFieldLabels = useMemo(
    () => changedFields.map(field => FIELD_LABELS[field]),
    [changedFields],
  );

  const hasUnsavedChanges = changedFields.length > 0;
  const ocrSuccess = ocrStatus === 'done' && !!ocrExtraction && !ocrError;
  const ocrText = useMemo(() => {
    const text = ocrExtraction?.rawText ?? '';
    const trimmed = text.trim();
    return trimmed || null;
  }, [ocrExtraction]);
  const mappedPreview = useMemo(() => {
    if (!ocrExtraction) return null;
    if (ocrExtraction.extractionType !== 'CompetencyCertificate') return null;
    const partial = mapCompetencyExtraction(ocrExtraction);
    const entries = Object.entries(partial).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && !value.trim()) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });
    return entries.length ? Object.fromEntries(entries) : null;
  }, [ocrExtraction]);
  const mappedEntries = useMemo(() => {
    if (!mappedPreview) return [];
    return Object.entries(mappedPreview).map(([key, value]) => {
      const label = FIELD_LABELS[key as DraftField] ?? key;
      if (key === 'licenceTypeCode') {
        const display = formatCertificateTypeLabel(String(value)) ?? String(value ?? '');
        return { key, label, value: display };
      }
      if (key === 'categories') {
        const list = Array.isArray(value) ? value.map((item) => CATEGORY_LABELS[item as CompetencyCategory] ?? String(item)) : [];
        return { key, label, value: list.join(', ') };
      }
      return { key, label, value: String(value ?? '') };
    });
  }, [mappedPreview]);
  const docIdParam = docId ? String(docId) : undefined;
  const parentCertificateId = useMemo(() => {
    if (existing?.id) return existing.id;
    if (id) return String(id);
    return docRecord?.parentId ?? null;
  }, [docRecord?.parentId, existing?.id, id]);
  const manualReturnPath = useMemo(() => {
    const params = new URLSearchParams();
    if (docId) params.set('docId', docId);
    if (parentCertificateId) params.set('id', parentCertificateId);
    if (baseReturnPath) params.set('returnTo', encodeURIComponent(baseReturnPath));
    if (selectionParam) params.set('selectionParam', selectionParam);
    if (seededSelection.length) {
      params.set('selectedCertIds', JSON.stringify(seededSelection));
    }
    if (cameFromWizard) params.set('fromWizard', '1');
    return params.toString() ? `/competency/manual?${params.toString()}` : '/competency/manual';
  }, [baseReturnPath, cameFromWizard, docId, parentCertificateId, seededSelection, selectionParam]);
  const encodedManualReturnPath = useMemo(
    () => encodeURIComponent(manualReturnPath),
    [manualReturnPath],
  );
  const invalidIssued = validationEnabled && !!draft.issuedAt && !validateDateISO(draft.issuedAt);
  const invalidExpires = validationEnabled && !!draft.expiresAt && !validateDateISO(draft.expiresAt);
  const certificateTypeLabel = useMemo(
    () => formatCertificateTypeLabel(draft.licenceTypeCode),
    [draft.licenceTypeCode],
  );

  const persistDraft = useCallback((): CompetencyCertificate | null => {
    const trimmedLicenceType = draft.licenceTypeCode.trim();
    const normalizedCertNumber = normalizeString(draft.certificateNumber);
    if (validationEnabled && draft.categories.length === 0) {
      Alert.alert('Select categories', 'Pick at least one competency category.');
      return null;
    }
    if (validationEnabled && draft.issuedAt && !validateDateISO(draft.issuedAt)) {
      Alert.alert('Invalid date', 'Issued date should be YYYY-MM-DD, e.g. 2024-05-17');
      return null;
    }
    if (validationEnabled && draft.expiresAt && !validateDateISO(draft.expiresAt)) {
      Alert.alert('Invalid date', 'Expiry date should be YYYY-MM-DD, e.g. 2027-05-17');
      return null;
    }
    if (duplicateChecksEnabled) {
      const comparable = normalizeForCompare(normalizedCertNumber);
      if (comparable) {
        const excludeId = existing?.id ?? id ?? null;
        const duplicate = listByType<CompetencyCertificate>('CompetencyCertificate').find(cert => {
          if (!cert.certificateNumber) return false;
          if (excludeId && String(cert.id) === String(excludeId)) return false;
          return normalizeForCompare(cert.certificateNumber) === comparable;
        });
        if (duplicate) {
          const dupeLabel = duplicate.certificateNumber?.trim() || 'Existing certificate';
          Alert.alert(
            'Duplicate certificate',
            `A competency certificate with number "${dupeLabel}" already exists.`
          );
          return null;
        }
      }
    }

    if (existing) {
      const next = touch({
        ...existing,
        categories: [...draft.categories],
        certificateNumber: normalizedCertNumber || undefined,
        trainingProvider: normalizeString(draft.trainingProvider) || undefined,
        issuedAt: normalizeString(draft.issuedAt) || undefined,
        expiresAt: normalizeString(draft.expiresAt) || undefined,
        isCurrent: draft.isCurrent,
        licenceTypes: trimmedLicenceType ? [trimmedLicenceType] : undefined,
        certificateDocumentId: docIdParam ?? existing.certificateDocumentId,
      } as CompetencyCertificate);
      persist(next);
      attachDocumentToCertificate(next.id);
      setExisting(next);
      const base = draftFromCertificate(next);
      setInitialDraft(base);
      setDraft(cloneDraft(base));
      return next;
    }

    const holder = ensureProfile();
    const seededId = id ? String(id) : undefined;
    const cert = withMeta<CompetencyCertificate>({
      id: seededId ?? (globalThis.crypto?.randomUUID?.() ?? `cert_${Math.random().toString(36).slice(2)}`),
      type: 'CompetencyCertificate',
      holderProfileId: holder.id,
      categories: [...draft.categories],
      certificateNumber: normalizedCertNumber || undefined,
      trainingProvider: normalizeString(draft.trainingProvider) || undefined,
      issuedAt: normalizeString(draft.issuedAt) || undefined,
      expiresAt: normalizeString(draft.expiresAt) || undefined,
      certificateDocumentId: docIdParam,
      isCurrent: draft.isCurrent,
      licenceTypes: trimmedLicenceType ? [trimmedLicenceType] : undefined,
    } as any);
    persist(cert);
    attachDocumentToCertificate(cert.id);
    setExisting(cert);
    const base = draftFromCertificate(cert);
    setInitialDraft(base);
    setDraft(cloneDraft(base));
    return cert;
  }, [
    attachDocumentToCertificate,
    docIdParam,
    draft,
    duplicateChecksEnabled,
    ensureProfile,
    existing,
    id,
    validationEnabled,
  ]);

  const handleSave = useCallback(() => {
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }
    const wasExisting = !!existing;
    const saved = persistDraft();
    if (!saved) return;
    attachDocumentToCertificate(saved.id);
    handlePostSave(saved, wasExisting);
  }, [attachDocumentToCertificate, existing, goReturn, handlePostSave, hasUnsavedChanges, persistDraft]);

  const handleSaveAndClose = useCallback(() => {
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }
    const wasExisting = !!existing;
    const saved = persistDraft();
    if (saved) {
      attachDocumentToCertificate(saved.id);
      handlePostSave(saved, wasExisting);
    }
  }, [attachDocumentToCertificate, existing, goReturn, handlePostSave, hasUnsavedChanges, persistDraft]);

  const handleDiscard = useCallback(() => {
    setDraft(cloneDraft(initialDraft));
    goReturn();
  }, [initialDraft, goReturn]);

  const toggleIsCurrent = useCallback(() => {
    setDraft(prev => ({ ...prev, isCurrent: !prev.isCurrent }));
  }, []);

  const handleOpenEdit = useCallback(() => {
    const navPayload = {
      ...navCtx,
      routeBack: manualReturnPath,
      returnTo: manualReturnPath,
      clearRouteBackHistory: false,
    };
    const params: Record<string, string> = {
      returnTo: encodedManualReturnPath,
      selectionParam,
      origin: 'manual',
      hideContinue: '1',
      nav: encodeURIComponent(JSON.stringify(navPayload)),
    };
    if (parentCertificateId) {
      params.certificateId = parentCertificateId;
    }
    const selectedIds = ensureSelectionWith(parentCertificateId);
    if (selectedIds.length) {
      params.selectedCertIds = JSON.stringify(selectedIds);
    }
    router.push({ pathname: '/competency/wizard', params } as any);
  }, [encodedManualReturnPath, ensureSelectionWith, manualReturnPath, navCtx, parentCertificateId, router, selectionParam]);

  const handleClose = useCallback(() => {
    setSheet(null);
    if (!hasUnsavedChanges) {
      goReturn();
      return;
    }

    const message = `You have unsaved changes:\n${changedFieldLabels.map(label => `• ${label}`).join('\n')}`;
    Alert.alert('Unsaved changes', message, [
      { text: 'Discard', style: 'destructive', onPress: handleDiscard },
      { text: 'Save', onPress: handleSaveAndClose },
    ]);
  }, [changedFieldLabels, handleDiscard, handleSaveAndClose, goReturn, hasUnsavedChanges]);

  const Pill = ({ value }: { value: CompetencyCategory }) => {
    const selected = draft.categories.includes(value);
    const palette = categoryColors[value];
    const label = CATEGORY_LABELS[value] ?? value;
    return (
      <Pressable
        onPress={() => toggleCat(value)}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: selected ? palette.background : neutral.onBase,
            borderColor: selected ? palette.activeBorder : palette.border,
            borderWidth: selected ? 2 : 1,
          },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.pillTxt,
            selected && styles.pillTxtSelected,
            { color: selected ? palette.activeText : palette.text },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const Cell = ({
    label,
    value,
    onPress,
    warning,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    warning?: boolean;
  }) => {
    const rawValue = typeof value === 'string' ? value : '';
    const trimmed = rawValue.trim();
    const hasValue = trimmed.length > 0;
    const displayValue = hasValue ? rawValue : 'Tap to add';
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cell,
            warning && styles.cellWarning,
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text
            style={[
              styles.value,
              !hasValue && styles.placeholder,
              warning && styles.valueWarning,
            ]}
            numberOfLines={2}
          >
            {displayValue}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title={existing ? 'Edit Certificate' : 'Add Certificate'}
          onClose={handleClose}
          onSave={handleSave}
          saveDisabled={!hasUnsavedChanges}
          style={styles.header}
          extraActions={
            <IconRoundButton
              buttonType="preview"
              accessibilityLabel="Edit certificate photo"
              onPress={handleOpenEdit}
              size="sm"
              hitSlop={8}
            />
          }
        />
        <PageScrollView contentContainerStyle={styles.content}>
          {showDevDiagnostics && (ocrStatus !== 'idle' || ocrError || ocrExtraction) && (
            <View
              style={[
                styles.ocrBanner,
                ocrError
                  ? styles.ocrBannerError
                  : ocrStatus === 'running'
                    ? styles.ocrBannerInfo
                    : styles.ocrBannerSuccess,
              ]}
            >
              {ocrStatus === 'running' && (
                <ActivityIndicator
                  size="small"
                  color={tones.blue.base}
                  style={styles.ocrSpinner}
                />
              )}
              <View style={styles.ocrSuccessContent}>
                <Text
                  style={[
                    styles.ocrBannerText,
                    ocrError
                      ? styles.ocrBannerTextError
                      : ocrStatus === 'running'
                        ? styles.ocrBannerTextInfo
                        : styles.ocrBannerTextSuccess,
                  ]}
                >
                  {ocrStatus === 'running'
                    ? 'Extracting details from your document...'
                    : ocrError
                      ? `We could not prefill this document: ${ocrError}`
                      : ocrStatus === 'done' && !ocrSuccess
                        ? 'OCR completed but no extractable text was found.'
                        : 'We prefilled details from your document. Please confirm below.'}
                </Text>
                <Text style={styles.ocrBannerLabel}>OCR text</Text>
                {ocrText ? (
                  <Text selectable style={styles.ocrBannerJson}>{ocrText}</Text>
                ) : (
                  <Text style={styles.ocrBannerEmpty}>No OCR text captured.</Text>
                )}
                <Text style={styles.ocrBannerLabel}>Mapped fields preview</Text>
                {mappedEntries.length ? (
                  <View style={styles.mappedList}>
                    {mappedEntries.map((entry) => (
                      <View key={entry.key} style={styles.mappedRow}>
                        <Text style={styles.mappedLabel}>{entry.label}</Text>
                        <Text selectable style={styles.mappedValue}>{entry.value || '—'}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.ocrBannerEmpty}>No mapped fields found.</Text>
                )}
              </View>
            </View>
          )}
          <Cell
            label="Certificate type"
            value={certificateTypeLabel}
            onPress={openCertificateTypeSheet}
          />          
          <Text style={styles.sectionTitle}>Categories</Text>
          <View style={styles.pillsRow}>
            {CATS.map(c => (<Pill key={c} value={c} />))}
          </View>


          <Cell label="Certificate number" value={draft.certificateNumber} onPress={() => openEditor('certificateNumber', 'Certificate number')} />
          <Cell
            label="Date issued"
            value={draft.issuedAt}
            onPress={() => openEditor('issuedAt', 'Issued date', 'date')}
            warning={invalidIssued}
          />
          <Cell
            label="Expires on"
            value={draft.expiresAt}
            onPress={() => openEditor('expiresAt', 'Expiry date', 'date')}
            warning={invalidExpires}
          />
          {/* <Cell label="Training provider" value={draft.trainingProvider} onPress={() => openEditor('trainingProvider', 'Training provider')} /> */}

          {/* <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Is current</Text>
            <IconRoundButton
              buttonType={draft.isCurrent ? 'checkmark-circle' : 'ellipse-outline'}
              accessibilityLabel={draft.isCurrent ? 'Mark certificate as not current' : 'Mark certificate as current'}
              onPress={toggleIsCurrent}
              size="sm"
              hitSlop={8}
              style={styles.toggleButton}
            />
          </View> */}
          <ButtonSave
            onPress={handleSave}
            disabled={!hasUnsavedChanges}
            style={styles.saveButton}
            align='center'
          />
        </PageScrollView>
      </View>

      {sheet?.type === 'text' && (
        <EditTextSheet
          visible
          title={sheet.title}
          initial={editingInitial}
          placeholder={sheet.title}
          onCancel={() => setSheet(null)}
          onSave={onSaveEditor}
          keyboardType={sheet.mask === 'date' ? 'numeric' : 'default'}
          mask={sheet.mask}
          autoCapitalize="characters"
        />
      )}

      {sheet?.type === 'select' && sheet.key === 'certificateType' && (
        <SelectSheet
          visible
          title={sheet.title}
          options={CERT_TYPE_OPTIONS}
          selected={draft.licenceTypeCode || undefined}
          onCancel={() => setSheet(null)}
          onPick={(value) => onPickCertificateType(String(value))}
        />
      )}
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    content: { gap: 10, paddingBottom: 32 },
    saveButton: { marginTop: 4 },
    ocrBanner: {
      marginBottom: 12,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    ocrBannerInfo: {
      backgroundColor: tones.blue.surface,
      borderColor: tones.blue.border,
    },
    ocrBannerSuccess: {
      backgroundColor: tones.green.surface,
      borderColor: tones.green.border,
    },
    ocrBannerError: {
      backgroundColor: tones.red.surface,
      borderColor: tones.red.border,
    },
    ocrSpinner: { marginRight: 10 },
    ocrBannerText: { flex: 1, fontSize: 14, fontWeight: '600' },
    ocrBannerTextInfo: { color: tones.blue.onSurface },
    ocrBannerTextSuccess: { color: tones.green.onSurface },
    ocrBannerTextError: { color: tones.red.onSurface },
    ocrSuccessContent: { flex: 1 },
    ocrBannerLabel: {
      marginTop: 6,
      fontSize: 12,
      fontWeight: '700',
      color: tones.green.onSurface,
    },
    ocrBannerEmpty: {
      marginTop: 4,
      fontSize: 12,
      color: tones.green.onSurface,
    },
    ocrBannerJson: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 16,
      color: tones.green.onSurface,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Courier' }),
    },
    mappedList: { marginTop: 6, gap: 6 },
    mappedRow: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: tones.green.border },
    mappedLabel: { fontSize: 12, fontWeight: '700', color: tones.green.onSurface },
    mappedValue: { marginTop: 2, fontSize: 12, color: tones.green.onSurface },
    sectionTitle: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },

    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
    pillTxt: { fontWeight: '600' },
    pillTxtSelected: { fontWeight: '800' },

    label: { color: tones.teal.base, marginBottom: 6, fontWeight: '700' },

    cell: {
      backgroundColor: neutral.onBase,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: 'rgba(0,0,0,0.2)',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    cellWarning: {
      borderColor: tones.orange.base,
    },
    value: { fontSize: 16, color: neutral.onSurface, fontWeight: '600' },
    valueWarning: { color: tones.orange.base },
    placeholder: { color: neutral.border, fontWeight: '500' },
    chev: { fontSize: 24, color: neutral.border, marginLeft: 8 },

    toggleRow: { marginTop: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { color: tones.teal.base, fontWeight: '700', fontSize: 16 },
    toggleButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
