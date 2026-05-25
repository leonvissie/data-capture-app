import React, { useMemo } from 'react';
import { View, StyleSheet, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PageHeader from '../../../src/components/PageHeader';
import Screen from '../../../src/components/Screen';
import { PdfPreview } from '../../../src/components/PdfPreview';
import { useTones } from '../../../src/theme/tones';
import { IconRoundButton } from '../../../src/components/RoundIconButton';
import { backOrReplace } from '../../../src/utils/navigation';
import { useDevMode } from '../../../src/providers/DevModeProvider';
import { getById } from '../../../src/data/sqlite';
import { Application, Document, Firearm, CompetencyCertificate } from '../../../src/data/types';
import { collectSupportingDocumentsForApplication } from '../../../src/pdf/supporting';
import { resolveApplicationFirearms, resolveApplicationCompetencyCertificates } from '../../../src/pdf/context';
import { logger } from '@/src/utils/logger';
import { categoryLabel } from '../../../src/utils/categoryLabel';
import { sharePdf } from '../../../src/utils/sharePdf';
import { appConfig } from '../../../src/config/appConfig';

export default function ApplicationPreviewScreen() {
  const router = useRouter();
  const { devModeEnabled } = useDevMode();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const params = useLocalSearchParams<{
    id?: string | string[];
    uri?: string | string[];
    title?: string | string[];
    paid?: string | string[];
    headings?: string | string[];
    reqs?: string | string[];
  }>();

  const applicationId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw ? String(raw) : null;
  }, [params.id]);

  const application = useMemo(
    () => (applicationId ? getById<Application>(applicationId) : undefined),
    [applicationId]
  );

  const pdfUri = useMemo(() => {
    const raw = Array.isArray(params.uri) ? params.uri[0] : params.uri;
    return raw ? decodeURIComponent(raw) : null;
  }, [params.uri]);

  const supportingHeadings = useMemo(() => {
    const raw = Array.isArray(params.headings) ? params.headings[0] : params.headings;
    if (!raw) return [];
    try {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch (err) {
      logger.warn('supporting headings decode failed', err);
      return [];
    }
  }, [params.headings]);

  const checklistRequirements = useMemo(() => {
    const raw = Array.isArray(params.reqs) ? params.reqs[0] : params.reqs;
    if (!raw) return [];
    try {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch (err) {
      logger.warn('supporting reqs decode failed', err);
      return [];
    }
  }, [params.reqs]);

  const linkedDocs = useMemo<Document[]>(() => {
    if (!application) return [];
    try {
      return collectSupportingDocumentsForApplication(application);
    } catch (err) {
      logger.warn('dev linked docs resolve failed', err);
      return [];
    }
  }, [application]);

  const formatDocDebug = (doc: Document): string => {
    const name = doc.name || doc.requirementRelatedLabel || doc.requirementCode || 'Document';
    const parts: string[] = [];
    if (doc.requirementCode) parts.push(doc.requirementCode);
    if (doc.requirementRelatedId) parts.push(`rel:${doc.requirementRelatedId}`);
    if (doc.identityDocumentSide && doc.identityDocumentSide !== 'not_applicable') {
      parts.push(String(doc.identityDocumentSide));
    }
    const base = `${name}`;
    return parts.length ? `${base} — ${parts.join(' • ')}` : base;
  };

  const linkedFirearms = useMemo<Firearm[]>(() => {
    if (!application) return [];
    try {
      return resolveApplicationFirearms(application);
    } catch (err) {
      logger.warn('dev linked firearms resolve failed', err);
      return [];
    }
  }, [application]);

  const linkedCompetencyCerts = useMemo<CompetencyCertificate[]>(() => {
    if (!application) return [];
    try {
      return resolveApplicationCompetencyCertificates(application);
    } catch (err) {
      logger.warn('dev linked competency resolve failed', err);
      return [];
    }
  }, [application]);

  const formatFirearmDebug = (firearm: Firearm): string => {
    const parts = [
      firearm.firearmType ? categoryLabel(firearm.firearmType) : '',
      [firearm.make, firearm.model].filter(Boolean).join(' ').trim(),
    ].filter(Boolean);
    const serial =
      firearm.firearmSerialNumber ||
      (firearm as any).serialNumber ||
      (firearm as any).frameSerialNumber ||
      (firearm as any).receiverSerialNumber;
    const section =
      firearm.section ||
      (firearm as any).licenceSection ||
      (firearm as any).licenseSection;
    if (section) parts.push(`Section ${section}`);
    if (firearm.licenseNumber) parts.push(`Licence ${firearm.licenseNumber}`);
    if (serial) parts.push(`Serial ${serial}`);
    return parts.join(' • ') || 'Firearm';
  };

  const formatCompetencyDebug = (cert: CompetencyCertificate): string => {
    const num = cert.certificateNumber || 'Competency certificate';
    const categories = Array.isArray(cert.categories)
      ? cert.categories.map(categoryLabel).filter(Boolean).join(', ')
      : '';
    const licenceTypes = Array.isArray(cert.licenceTypes) ? cert.licenceTypes.join(', ') : '';
    const parts = [num];
    if (categories) parts.push(categories);
    if (licenceTypes) parts.push(licenceTypes);
    return parts.join(' • ');
  };

  const title = useMemo(() => {
    const raw = Array.isArray(params.title) ? params.title[0] : params.title;
    return raw || 'Preview';
  }, [params.title]);

  const isPaid = useMemo(() => {
    const raw = Array.isArray(params.paid) ? params.paid[0] : params.paid;
    return raw === '1' || raw === 'true';
  }, [params.paid]);

  const handleShare = async () => {
    if (!pdfUri) return;
    try {
      await sharePdf(pdfUri, 'Share PDF');
    } catch (err: any) {
      logger.warn('preview share error', err);
      Alert.alert('Unable to share PDF', err?.message ?? 'An error occurred while sharing the PDF.');
    }
  };

  const goBack = React.useCallback(() => backOrReplace(router), [router]);

  const shareAction =
    (isPaid || appConfig.features.showDevTools) && pdfUri ? (
      <IconRoundButton
        buttonType="share"
        accessibilityLabel="Share document"
        onPress={handleShare}
        size="sm"
      />
    ) : null;

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title={title}
          onBack={goBack}
          style={styles.header}
          extraActions={shareAction}
        />
        {/* {devModeEnabled && (supportingHeadings.length || checklistRequirements.length || linkedDocs.length || linkedFirearms.length || linkedCompetencyCerts.length) ? (
          <View style={styles.devCard}>
            {!!checklistRequirements.length && (
              <View style={styles.devBlock}>
                <Text style={styles.devCardTitle}>Checklist requirements</Text>
                <Text style={styles.devCardSubtitle}>From checklist resolver</Text>
                {checklistRequirements.map((heading, idx) => (
                  <Text key={`req-${heading}-${idx}`} style={styles.devCardItem}>
                    {idx + 1}. {heading}
                  </Text>
                ))}
              </View>
            )}
            {!!supportingHeadings.length && (
              <View style={styles.devBlock}>
                <Text style={styles.devCardTitle}>Supporting PDF pages</Text>
                <Text style={styles.devCardSubtitle}>Derived from supporting.ts grouping</Text>
                {supportingHeadings.map((heading, idx) => (
                  <Text key={`page-${heading}-${idx}`} style={styles.devCardItem}>
                    {idx + 1}. {heading}
                  </Text>
                ))}
              </View>
            )}
            {!!linkedDocs.length && (
              <View style={styles.devBlock}>
                <Text style={styles.devCardTitle}>Linked documents ({linkedDocs.length})</Text>
                <Text style={styles.devCardSubtitle}>From application + stored docs</Text>
                {linkedDocs.map((doc, idx) => (
                  <Text key={`doc-${doc.id ?? idx}`} style={styles.devCardItem}>
                    {idx + 1}. {formatDocDebug(doc)}
                  </Text>
                ))}
              </View>
            )}
            {!!linkedFirearms.length && (
              <View style={styles.devBlock}>
                <Text style={styles.devCardTitle}>Linked firearms ({linkedFirearms.length})</Text>
                <Text style={styles.devCardSubtitle}>Resolved via context helpers</Text>
                {linkedFirearms.map((firearm, idx) => (
                  <Text key={`firearm-${firearm.id ?? idx}`} style={styles.devCardItem}>
                    {idx + 1}. {formatFirearmDebug(firearm)}
                  </Text>
                ))}
              </View>
            )}
            {!!linkedCompetencyCerts.length && (
              <View style={styles.devBlock}>
                <Text style={styles.devCardTitle}>Linked competency certs ({linkedCompetencyCerts.length})</Text>
                <Text style={styles.devCardSubtitle}>Resolved via context helpers</Text>
                {linkedCompetencyCerts.map((cert, idx) => (
                  <Text key={`comp-${cert.id ?? idx}`} style={styles.devCardItem}>
                    {idx + 1}. {formatCompetencyDebug(cert)}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : null} */}
        <View style={styles.preview}>
          {pdfUri ? (
            <PdfPreview uri={pdfUri} />
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>No PDF available to preview.</Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], _tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16 },
    devCard: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      padding: 12,
      borderRadius: 10,
      backgroundColor: neutral.surface,
      borderColor: neutral.border,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    devBlock: { gap: 4 },
    devCardTitle: { fontWeight: '700', color: neutral.onSurface, fontSize: 14 },
    devCardSubtitle: { color: neutral.base, fontSize: 12 },
    devCardItem: { color: neutral.onSurface, fontSize: 12 },
    preview: { flex: 1 },
    fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    fallbackText: { color: neutral.base, textAlign: 'center' },
  });
