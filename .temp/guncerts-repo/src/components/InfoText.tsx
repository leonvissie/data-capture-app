import React from 'react';
import { Linking, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';

type PProps = {
  children: React.ReactNode;
  baseStyle?: StyleProp<TextStyle>;
  style?: StyleProp<TextStyle>;
};

export function P({ children, baseStyle, style }: PProps) {
  return <Text style={[baseStyle, style]}>{children}</Text>;
}

type TxtProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
};

export function Txt({ children, style }: TxtProps) {
  return <Text style={style}>{children}</Text>;
}

type LinkTextProps = {
  children: React.ReactNode;
  href: string;
  style?: StyleProp<TextStyle>;
  onPressLink?: (href: string) => void | Promise<void>;
};

export function LinkText({ children, href, style, onPressLink }: LinkTextProps) {
  const onPress = async () => {
    if (onPressLink) {
      await onPressLink(href);
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(href);
      if (canOpen) {
        await Linking.openURL(href);
      }
    } catch {
      // ignore link failures in static info text
    }
  };

  return (
    <Text style={style} accessibilityRole="link" onPress={onPress}>
      {children}
    </Text>
  );
}

type BulletProps = {
  children: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  dotStyle?: StyleProp<TextStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function Bullet({ children, containerStyle, dotStyle, textStyle }: BulletProps) {
  return (
    <View style={containerStyle}>
      <Text style={dotStyle}>{'\u2022'}</Text>
      <Text style={textStyle}>{children}</Text>
    </View>
  );
}
