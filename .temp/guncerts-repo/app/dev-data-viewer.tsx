import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Screen from '../src/components/Screen';
import { useTones } from '../src/theme/tones';
import { deleteEntity, listByType, saveEntity } from '../src/data/sqlite';
import { AnyEntity, Application, Document, Extraction, Profile, Firearm, Safe, CompetencyCertificate, UserPrefs, DevicePrefs, Feedback, Reminders, SupportingStatement, Proficiency } from '../src/data/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { appConfig } from '../src/config/appConfig';
import PageHeader from '../src/components/PageHeader';
import { IconRoundButton } from '../src/components/RoundIconButton';

type EntityKey =
  | 'Application'
  | 'Profile'
  | 'UserPrefs'
  | 'DevicePrefs'
  | 'Document'
  | 'Extraction'
  | 'Firearm'
  | 'Safe'
  | 'CompetencyCertificate'
  | 'Proficiency'
  | 'SupportingStatement'
  | 'Reminders'
  | 'Feedback';
const ENTITY_OPTIONS: EntityKey[] = [
  'Application',
  'Profile',
  'UserPrefs',
  'DevicePrefs',
  'Document',
  'Extraction',
  'Firearm',
  'Safe',
  'CompetencyCertificate',
  'Proficiency',
  'SupportingStatement',
  'Reminders',
  'Feedback',
];

function isEntityKey(value?: string | string[] | null): value is EntityKey {
  if (!value) return false;
  const v = Array.isArray(value) ? value[0] : value;
  return (ENTITY_OPTIONS as string[]).includes(v);
}

export default function DevDataViewer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ entity?: EntityKey }>();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);

  const [selectedEntity, setSelectedEntity] = useState<EntityKey>('Application');
  const [tick, setTick] = useState(0);

  // Sync selection from params when present
  useEffect(() => {
    if (isEntityKey(params.entity)) {
      setSelectedEntity(params.entity);
    }
  }, [params.entity]);

  // refresh on mount & whenever screen regains focus
  useEffect(() => setTick(t => t + 1), []);
  useFocusEffect(useCallback(() => setTick(t => t + 1), []));

  const apps = useMemo(() => listByType<Application>('Application'), [tick]);
  const profiles = useMemo(() => listByType<Profile>('Profile'), [tick]);
  const documents = useMemo(() => listByType<Document>('Document'), [tick]);
  const userPrefs = useMemo(() => listByType<UserPrefs>('UserPrefs'), [tick]);
  const devicePrefs = useMemo(() => listByType<DevicePrefs>('DevicePrefs'), [tick]);
  const extractions = useMemo(() => listByType<Extraction>('Extraction'), [tick]);
  const firearms = useMemo(() => listByType<Firearm>('Firearm'), [tick]);
  const safes = useMemo(() => listByType<Safe>('Safe'), [tick]);
  const certs = useMemo(() => listByType<CompetencyCertificate>('CompetencyCertificate'), [tick]);
  const proficiencies = useMemo(() => listByType<Proficiency>('Proficiency'), [tick]);
  const supportingStatements = useMemo(() => listByType<SupportingStatement>('SupportingStatement'), [tick]);
  const reminders = useMemo(() => listByType<Reminders>('Reminders'), [tick]);
  const feedback = useMemo(() => listByType<Feedback>('Feedback'), [tick]);

  const currentProfile = useMemo(() => profiles[0] ?? null, [profiles]);

  const getItems = (key: EntityKey): AnyEntity[] => {
    switch (key) {
      case 'Application':
        return apps;
      case 'Profile':
        return profiles;
      case 'UserPrefs':
        return userPrefs;
      case 'DevicePrefs':
        return devicePrefs;
      case 'Document':
        return documents;
      case 'Extraction':
        return extractions;
      case 'Firearm': {
        // If firearms have an owner link, filter to current user; otherwise show all (MVP compatibility)
        if (currentProfile) {
          return firearms.filter((f: any) => !('holderProfileId' in f) || f.holderProfileId === currentProfile.id) as AnyEntity[];
        }
        return firearms as AnyEntity[];
      }
      case 'Safe':
        return safes as AnyEntity[];
      case 'CompetencyCertificate': {
        if (currentProfile) {
          return certs.filter(c => c.holderProfileId === currentProfile.id) as AnyEntity[];
        }
        return certs as AnyEntity[];
      }
      case 'Proficiency': {
        if (currentProfile) {
          return proficiencies.filter((p) => p.holderProfileId === currentProfile.id) as AnyEntity[];
        }
        return proficiencies as AnyEntity[];
      }
      case 'SupportingStatement':
        return supportingStatements as AnyEntity[];
      case 'Feedback':
        return feedback;
      case 'Reminders':
        return reminders;
    }
  };

  const data = getItems(selectedEntity);

  const handleClearEntity = useCallback(() => {
    if (!data.length) return;
    Alert.alert(
      'Clear data?',
      `This will delete all ${selectedEntity} entries. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            data.forEach((item) => deleteEntity(item.id));
            setTick((t) => t + 1);
          },
        },
      ],
    );
  }, [data, selectedEntity]);

  const canDuplicate = selectedEntity === 'Firearm' || selectedEntity === 'CompetencyCertificate';

  const handleCopy = useCallback(async (payload: AnyEntity) => {
    try {
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    } catch (err) {
      Alert.alert('Copy failed', 'Unable to copy this entry to the clipboard.');
    }
  }, []);

  const handleDuplicate = useCallback((payload: AnyEntity) => {
    try {
      const now = new Date().toISOString();
      const next = {
        ...payload,
        id: (globalThis.crypto?.randomUUID?.() ?? `dup_${Math.random().toString(36).slice(2)}`),
        createdAt: now,
        updatedAt: now,
        version: 1,
        schemaVersion: payload.schemaVersion ?? 1,
      } as AnyEntity;
      saveEntity(next);
      setTick((t) => t + 1);
    } catch (err) {
      Alert.alert('Duplicate failed', 'Unable to duplicate this entry.');
    }
  }, []);

  const renderCard = ({ item }: { item: AnyEntity }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {item.type} • {new Date(item.updatedAt).toLocaleString()}
        </Text>
        <IconRoundButton
          buttonType="copy"
          accessibilityLabel={canDuplicate ? 'Duplicate entry' : 'Copy entry'}
          onPress={() => (canDuplicate ? handleDuplicate(item) : handleCopy(item))}
          size={30}
        />
      </View>
      <Text selectable style={styles.mono}>
        {JSON.stringify(item, null, 2)}
      </Text>
    </View>
  );

  return (
    <Screen>
      <View style={styles.wrap}>
        <PageHeader
          title={`Data viewer`}
          onClose={() => router.back()}
          titleStyle={styles.headerTitle}
        />
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Data: {selectedEntity} ({data.length})</Text>
          <IconRoundButton
            buttonType="delete"
            accessibilityLabel={`Delete all ${selectedEntity} entries`}
            onPress={handleClearEntity}
            size={34}
          />
        </View>

        {/* <View style={styles.pickerWrap} accessible accessibilityLabel="Entity picker">
          <Picker
            selectedValue={selectedEntity}
            onValueChange={(v) => setSelectedEntity(v as EntityKey)}
            dropdownIconColor={neutral.onSurface as any}
            style={styles.picker} // height handles iOS wheel visibility
          >
            {ENTITY_OPTIONS.map(k => (
              <Picker.Item key={k} label={k} value={k} />
            ))}
          </Picker>
        </View> */}

        {/* <Text style={styles.help}>
          Showing {data.length} {selectedEntity}{data.length === 1 ? '' : 's'}
        </Text> */}

        {data.length === 0 ? (
          <Text style={styles.empty}>No {selectedEntity}s yet.</Text>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={data}
            keyExtractor={(e) => e.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}

        {/* <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable> */}
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    wrap: { flex: 1, padding: 20, gap: 12 },
    headerTitle: { fontSize: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, flex: 1 },
    pickerWrap: { borderWidth: 1, borderColor: neutral.border, borderRadius: 10, overflow: 'hidden' },
    // 👇 give iOS enough height for the wheel; compact height for Android
    picker: { color: neutral.onSurface, height: Platform.OS === 'ios' ? 216 : 48 },
    help: { color: neutral.base, marginTop: 6 },
    empty: { color: neutral.base, marginTop: 8 },

    card: { padding: 12, borderWidth: 1, borderColor: neutral.border, borderRadius: 12, marginTop: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
    cardTitle: { color: neutral.onSurface, fontWeight: '700', flex: 1 },
    mono: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      color: neutral.onSurface,
    },

    backBtn: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: tones.blue.base,
      backgroundColor: tones.blue.base,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    backBtnText: { color: tones.blue.onBase, fontWeight: '700' },
  });
