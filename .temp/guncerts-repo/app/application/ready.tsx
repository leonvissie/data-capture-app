import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import ApplicationListScreen from './components/ApplicationListScreen';
import { Application } from '../../src/data/types';
import { decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { deleteApplicationWithPdfCleanup } from '../../src/utils/deleteApplicationWithPdfCleanup';
import { buildApplicationAlertDetails } from '../../src/utils/applicationAlertDetails';

export default function ReadyApplicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ nav?: string | string[] }>();
  const navCtx = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return decodeNav(null);
    try {
      return decodeNav(JSON.parse(raw));
    } catch {
      return decodeNav(null);
    }
  }, [params.nav]);
  const listPathWithNav = useMemo(() => {
    const serialized = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!serialized) return '/application/ready';
    return `/application/ready?nav=${encodeURIComponent(String(serialized))}`;
  }, [params.nav]);
  const [reloadKey, setReloadKey] = useState(0);

  const confirmDelete = useCallback((app: Application, refresh: () => void) => {
    const message = buildApplicationAlertDetails(app);

    const deleteAppAndPdfs = async () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const deleted = await deleteApplicationWithPdfCleanup(app, { logTag: '[application/ready]' });
      if (deleted) {
        refresh();
      }
    };

    Alert.alert('Delete application?', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: () => { void deleteAppAndPdfs(); },
      },
    ]);
  }, []);

  const handleEmpty = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, '/(tabs)' as any);
  }, [navCtx, router]);

  const handleHome = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, '/(tabs)' as any);
  }, [navCtx, router]);

  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1);
    }, [])
  );

  return (
    <ApplicationListScreen
      title="Ready to submit"
      filter={(app) => app.status === 'ready'}
      onPressApplication={(app) =>
        (() => {
          const rawListNav = Array.isArray(params.nav) ? params.nav[0] : params.nav;
          const nextNav = { returnTo: listPathWithNav, routeBack: listPathWithNav, origin: listPathWithNav };
          router.push({
            pathname: '/application/[id]/ready-actions',
            params: {
              id: app.id,
              nav: JSON.stringify(nextNav),
              listNav: rawListNav,
              listPath: '/application/ready',
            },
          } as any);
        })()
      }
      headerClosePath="/(tabs)"
      onClose={handleHome}
      onEmpty={handleEmpty}
      emptyTitle="No applications ready yet"
      emptyText="Submit documents to mark an application as ready."
      reloadKey={reloadKey}
      buildOnDelete={(app, refresh) => () => confirmDelete(app, refresh)}
    />
  );
}
