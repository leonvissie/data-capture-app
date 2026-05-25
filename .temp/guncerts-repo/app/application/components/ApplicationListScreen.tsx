import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, UIManager, ListRenderItem } from 'react-native';
import { useRouter } from 'expo-router';
import Screen from '../../../src/components/Screen';
import PageHeader from '../../../src/components/PageHeader';
import PageFlatList from '../../../src/components/PageFlatList';
import { useTones } from '../../../src/theme/tones';
import { Application, CompetencyCertificate, Firearm } from '../../../src/data/types';
import { listByType } from '../../../src/data/sqlite';
import { ApplicationCard, ApplicationCardProps } from '../../../src/components/ApplicationCard';
import { closeTo } from '../../../src/navigation/helpers';

type FilterFn = (app: Application) => boolean;
type ActionBuilder = (app: Application, refresh: () => void) => (() => void) | undefined;

export type ApplicationListScreenProps = {
  title: string;
  filter: FilterFn;
  onPressApplication: (app: Application) => void;
  headerClosePath?: string;
  onClose?: () => void;
  headerLeadingActions?: React.ReactNode;
  emptyTitle: string;
  emptyText: string;
  renderEmptyExtras?: () => React.ReactNode;
  onEmpty?: () => void;
  reloadKey?: number;
  actionMode?: ApplicationCardProps['actionMode'];
  buildOnDelete?: ActionBuilder;
  buildOnShare?: ActionBuilder;
  showHeader?: boolean;
  showStatusBadge?: boolean;
  showMetaRow?: boolean;
  showActions?: boolean;
};

function sortApplications(apps: Application[]) {
  return apps.sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '');
    const tb = Date.parse(b.updatedAt || b.createdAt || '');
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });
}

export function ApplicationListScreen({
  title,
  filter,
  onPressApplication,
  headerClosePath = '/(tabs)',
  onClose,
  headerLeadingActions,
  emptyTitle,
  emptyText,
  renderEmptyExtras,
  onEmpty,
  reloadKey,
  actionMode,
  buildOnDelete,
  buildOnShare,
  showHeader,
  showStatusBadge,
  showMetaRow,
  showActions,
}: ApplicationListScreenProps) {
  const [tick, setTick] = useState(0);
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const apps = useMemo(() => {
    const all = listByType<Application>('Application');
    return sortApplications(all.filter(filter));
  }, [filter, tick, reloadKey]);

  useEffect(() => {
    if (!apps.length && onEmpty) {
      onEmpty();
    }
  }, [apps.length, onEmpty, reloadKey]);

  const competencyCertificatesById = useMemo(() => {
    const certs = listByType<CompetencyCertificate>('CompetencyCertificate');
    return certs.reduce<Record<string, CompetencyCertificate>>((acc, cert) => {
      acc[cert.id] = cert;
      return acc;
    }, {});
  }, [tick]);

  const firearmsById = useMemo(() => {
    const firearms = listByType<Firearm>('Firearm');
    return firearms.reduce<Record<string, Firearm>>((acc, firearm) => {
      acc[firearm.id] = firearm;
      return acc;
    }, {});
  }, [tick]);

  const renderItem: ListRenderItem<Application> = ({ item }) => (
    <ApplicationCard
      application={item}
      competencyCertificates={competencyCertificatesById}
      firearms={firearmsById}
      onPress={() => onPressApplication(item)}
      onDelete={buildOnDelete?.(item, refresh)}
      onShare={buildOnShare?.(item, refresh)}
      actionMode={actionMode}
      showHeader={showHeader}
      showStatusBadge={showStatusBadge}
      showMetaRow={showMetaRow}
      showActions={showActions}
    />
  );

  const shouldHideEmpty = apps.length === 0 && !!onEmpty;

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title={title}
          onClose={
            onClose
              ? onClose
              : () => closeTo(router as any, headerClosePath)
          }
          leadingActions={headerLeadingActions}
          style={styles.header}
        />
        <PageFlatList<Application>
          data={apps}
          keyExtractor={(item: Application) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            shouldHideEmpty ? null : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
              {renderEmptyExtras ? renderEmptyExtras() : null}
            </View>
            )
          }
        />
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 20, paddingBottom: 20 },
    header: { paddingHorizontal: 20 },
    listContent: { paddingTop: 8, paddingBottom: 24 },
    emptyWrap: { paddingVertical: 40, alignItems: 'center', gap: 6 },
    emptyTitle: { color: neutral.onSurface, fontWeight: '800', fontSize: 16 },
    emptyText: { color: neutral.base, textAlign: 'center' },
  });

export default ApplicationListScreen;
