import type { ComponentProps } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSurfacePalette } from '@/foundation/hooks/useThemeMode';
import { useTones } from '@/foundation/hooks/useTones';
import { componentMetrics } from '@/foundation/theme/components';
import { typography } from '@/foundation/theme/typography';

const ICON_BY_ROUTE: Record<string, keyof typeof Ionicons.glyphMap> = {
  insights: 'bar-chart-outline',
  home: 'add',
  settings: 'settings-outline',
};

const LABEL_BY_ROUTE: Record<string, string> = {
  insights: 'Insights',
  home: 'Capture',
  settings: 'Settings',
};

type ExpoTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function AppTabBar({ state, descriptors, navigation }: ExpoTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = useSurfacePalette();
  const tones = useTones();
  const m = componentMetrics.tabBar;
  const centerRouteName = 'home';

  return (
    <View
      style={[
        styles.safeArea,
        {
          paddingBottom: Math.max(insets.bottom, m.bottomGap),
          backgroundColor: 'transparent',
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.container,
          {
            height: m.height,
            marginHorizontal: m.horizontalMargin,
            borderRadius: m.borderRadius,
            paddingHorizontal: m.horizontalPadding,
            paddingVertical: m.verticalPadding,
            backgroundColor: palette.card,
            borderColor: palette.border,
            shadowColor: '#000000',
            shadowOpacity: m.shadowOpacity,
            shadowRadius: m.shadowRadius,
            shadowOffset: { width: m.shadowOffsetWidth, height: m.shadowOffsetHeight },
            elevation: m.elevation,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor.options;
          const isFocused = state.index === index;
          const isCenter = route.name === centerRouteName;

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
              ? options.title
              : LABEL_BY_ROUTE[route.name] ?? route.name;

          const iconName = ICON_BY_ROUTE[route.name] ?? 'ellipse-outline';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) return;

            if (isCenter && isFocused) {
              router.push('/categories/create');
              return;
            }

            if (!isFocused) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          if (isCenter) {
            return (
              <View key={route.key} style={styles.centerWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={typeof options.tabBarAccessibilityLabel === 'string' ? options.tabBarAccessibilityLabel : label}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={({ pressed }) => [
                    styles.centerButton,
                    {
                      width: m.centerButtonSize,
                      height: m.centerButtonSize,
                      borderRadius: m.centerButtonSize / 2,
                      marginTop: -m.centerButtonLift,
                      backgroundColor: isFocused ? tones.teal.emphasis : tones.teal.base,
                      borderColor: tones.teal.base,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons name={iconName} size={m.centerIconSize} color={tones.teal.onBase} />
                </Pressable>
                <Text style={[styles.centerLabel, { color: isFocused ? tones.teal.base : palette.textMuted }]}>{label}</Text>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={typeof options.tabBarAccessibilityLabel === 'string' ? options.tabBarAccessibilityLabel : label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.sideItem,
                {
                  minWidth: m.sideItemMinWidth,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Ionicons
                name={iconName}
                size={m.sideIconSize}
                color={isFocused ? tones.teal.base : palette.textMuted}
              />
              <Text style={[styles.sideLabel, { color: isFocused ? tones.teal.base : palette.textMuted }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sideLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  centerLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    marginTop: 4,
  },
});
