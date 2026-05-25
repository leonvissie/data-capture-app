import React, { useCallback, useMemo } from 'react';
import { Alert, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Button from '../../src/components/Button';
import ApplicationListScreen from './components/ApplicationListScreen';
import { Application } from '../../src/data/types';
import { resolveDocumentsNav, buildDocumentsRoute, decodeNav, backOrReplaceWithContext } from '../../src/navigation/helpers';
import { deleteApplicationWithPdfCleanup } from '../../src/utils/deleteApplicationWithPdfCleanup';
import { buildApplicationAlertDetails } from '../../src/utils/applicationAlertDetails';

export default function ExistingApplicationsScreen() {
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
    if (!serialized) return '/application/existing';
    return `/application/existing?nav=${encodeURIComponent(String(serialized))}`;
  }, [params.nav]);

  const confirmDelete = useCallback((app: Application, refresh: () => void) => {
    const msg = buildApplicationAlertDetails(app);

    const deleteAppAndPdfs = async () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const deleted = await deleteApplicationWithPdfCleanup(app, { logTag: '[application/existing]' });
      if (deleted) {
        refresh();
      }
    };

    Alert.alert('Delete application?', msg, [
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
    if (navCtx.returnTo || navCtx.routeBack || navCtx.origin) {
      backOrReplaceWithContext(router as any, navCtx, '/(tabs)' as any);
      return;
    }
    router.replace('/(tabs)' as any);
  }, [navCtx, router]);

  return (
    <ApplicationListScreen
      title="Draft applications"
      filter={(app) => (app.status ?? 'draft') === 'draft'}
      onPressApplication={(app) => {
        const nav = resolveDocumentsNav('existing', { id: app.id }, {
          origin: listPathWithNav,
          returnTo: listPathWithNav,
          routeBack: listPathWithNav,
        });
        const { pathname, params } = buildDocumentsRoute({ id: app.id, mode: 'edit', nav });
        router.push({ pathname, params } as any);
      }}
      headerClosePath="/(tabs)"
      onClose={handleHome}
      onEmpty={handleEmpty}
      emptyTitle="No existing applications"
      emptyText=""
      renderEmptyExtras={() => (
        <Button
          label="Start a new application"
          onPress={() =>
            router.push({
              pathname: '/new-application',
              params: { originReturnTo: encodeURIComponent('/application/existing') },
            } as any)
          }
          tone="teal"
          centerText
        />
      )}
      buildOnDelete={(app, refresh) => () => confirmDelete(app, refresh)}
    />
  );
}
