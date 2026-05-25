import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTones } from '../theme/tones';
import { type Tone } from '../theme/colors';
import { getHelpTheme, type HelpSection } from '../help/helpContent';

type HelpPalette = {
  heading: string;
  paragraph: string;
  subHeading: string;
  text: string;
  bullet: string;
  number: string;
  linkText: string;
  background: string;
  divider: string;
};

type HelpTopicContentProps = {
  sections?: HelpSection[];
  disabled?: boolean;
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
};

type InlineSegment = {
  text: string;
  strong: boolean;
};

const buildDefaultPalette = (tones: ReturnType<typeof useTones>): HelpPalette => ({
  heading: tones.grey.onSurface,
  paragraph: tones.grey.base,
  subHeading: tones.grey.onSurface,
  text: tones.grey.onSurface,
  bullet: tones.grey.onSurface,
  number: tones.grey.onSurface,
  linkText: tones.teal.base,
  background: tones.grey.onBase,
  divider: tones.grey.border,
});

const buildDefaultDisabledPalette = (tones: ReturnType<typeof useTones>): HelpPalette => ({
  heading: tones.grey.border,
  paragraph: tones.grey.border,
  subHeading: tones.grey.border,
  text: tones.grey.border,
  bullet: tones.grey.border,
  number: tones.grey.border,
  linkText: tones.grey.border,
  background: tones.grey.surface,
  divider: tones.grey.border,
});

const tokenAliases: { test: RegExp; replace: string }[] = [
  { test: /^brand\.info/, replace: 'status.info' },
  { test: /^brand\.primary/, replace: 'brand.primary' },
  { test: /^brand\.secondary/, replace: 'brand.secondary' },
];

const resolveColorToken = (token: string | undefined, tones: ReturnType<typeof useTones>): string | undefined => {
  if (!token) return undefined;

  const trimmed = token.trim();
  if (!trimmed.length) return undefined;

  if (trimmed.startsWith('#') || trimmed.startsWith('rgba') || trimmed.startsWith('rgb')) {
    return trimmed;
  }

  let path = trimmed;
  const aliasMatch = tokenAliases.find(({ test }) => test.test(path));
  if (aliasMatch) {
    path = path.replace(aliasMatch.test, aliasMatch.replace);
  }

  const toneMap: Record<string, Tone> = {
    'brand.primary': tones.teal,
    'brand.secondary': tones.purple,
    'status.info': tones.blue,
    'status.success': tones.green,
    'status.warning': tones.orange,
    'status.danger': tones.red,
    'status.neutral': tones.grey,
    'actions.add': tones.teal,
    'actions.edit': tones.purple,
    'actions.delete': tones.red,
    'actions.close': tones.blue,
    'actions.back': tones.grey,
    'actions.save': tones.teal,
    'actions.scan': tones.blue,
    'actions.upload': tones.purple,
    'actions.library': tones.purple,
    'actions.view': tones.purple,
    'actions.share': tones.pink,
    'actions.warning': tones.orange,
  };

  const [group, name, field] = path.split('.');
  const key = `${group}.${name}`;
  const tone = toneMap[key];
  if (tone && field && field in tone) {
    return tone[field as keyof Tone];
  }

  return undefined;
};

const buildPalette = (tones: ReturnType<typeof useTones>, disabled: boolean): HelpPalette => {
  const { helpColors, disabledColors } = getHelpTheme();
  const raw = disabled ? disabledColors : helpColors;
  const fallback = disabled ? buildDefaultDisabledPalette(tones) : buildDefaultPalette(tones);

  if (!raw) {
    return fallback;
  }

  const resolved = { ...fallback };
  (Object.keys(fallback) as (keyof HelpPalette)[]).forEach((key) => {
    if (key === 'background') return;
    const color = resolveColorToken(raw[key], tones);
    if (color) {
      resolved[key] = color;
    }
  });

  return resolved;
};

const parseInlineMarkdown = (input: string): InlineSegment[] => {
  if (!input.includes('**')) {
    return [{ text: input, strong: false }];
  }

  const parts = input.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return { text: part.slice(2, -2), strong: true };
    }
    return { text: part, strong: false };
  });
};

const renderInlineMarkdown = (
  input: string,
  textStyle: object,
  strongStyle: object
) =>
  parseInlineMarkdown(input).map((segment, index) => (
    <Text
      key={`${segment.strong ? 'strong' : 'text'}-${index}`}
      style={segment.strong ? [textStyle, strongStyle] : textStyle}
    >
      {segment.text}
    </Text>
  ));

const HelpTopicContent: React.FC<HelpTopicContentProps> = ({
  sections = [],
  disabled = false,
  emptyText = 'We could not find any help content for this screen.',
  style,
}) => {
  const tones = useTones();
  const styles = useMemo(() => createStyles(tones), [tones]);
  const palette = useMemo(() => buildPalette(tones, disabled), [tones, disabled]);
  const dividerColor = palette.divider;

  if (!sections.length) {
    return (
      <View style={style}>
        <Text style={[styles.empty, { color: palette.paragraph }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.content, style]}>
      {sections.map((section, idx) => {
        switch (section.type) {
          case 'heading':
            return (
              <View key={`heading-${idx}`} style={styles.block}>
                {section.items.map((item, itemIdx) => (
                  <Text
                    key={`heading-${idx}-${itemIdx}`}
                    style={[styles.paragraphHeading, { color: palette.paragraph }]}
                    accessibilityRole="header"
                  >
                    {item}
                  </Text>
                ))}
              </View>
            );
          case 'subheading':
            return (
              <Text
                key={`subheading-${idx}`}
                style={[styles.subHeading, { color: palette.subHeading }]}
                accessibilityRole="header"
              >
                {section.text}
              </Text>
            );
          case 'paragraph':
            return (
              <View key={`paragraph-${idx}`} style={styles.block}>
                {section.items.map((item, itemIdx) => (
                  <Text
                    key={`paragraph-${idx}-${itemIdx}`}
                    style={[styles.paragraph, { color: palette.paragraph }]}
                  >
                    {renderInlineMarkdown(
                      item,
                      [styles.paragraph, { color: palette.paragraph }],
                      styles.inlineStrong
                    )}
                  </Text>
                ))}
              </View>
            );
          case 'bullets':
            return (
              <View key={`bullets-${idx}`} style={styles.block}>
                {section.items.map((item, itemIdx) => (
                  <View key={`bullet-${idx}-${itemIdx}`} style={styles.listRow}>
                    <Text style={[styles.bulletSymbol, { color: palette.bullet }]}>•</Text>
                    <Text style={[styles.listText, { color: palette.text }]}>
                      {renderInlineMarkdown(
                        item,
                        [styles.listText, { color: palette.text }],
                        styles.inlineStrong
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'numbered':
            return (
              <View key={`numbered-${idx}`} style={styles.block}>
                {section.items.map((item, itemIdx) => (
                  <View key={`number-${idx}-${itemIdx}`} style={styles.listRow}>
                    <Text style={[styles.numberSymbol, { color: palette.number }]}>{itemIdx + 1}.</Text>
                    <Text style={[styles.listText, { color: palette.text }]}>
                      {renderInlineMarkdown(
                        item,
                        [styles.listText, { color: palette.text }],
                        styles.inlineStrong
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'links':
            if (!section.items.length) {
              return null;
            }
            return (
              <View key={`links-${idx}`} style={[styles.block, styles.linksBlock, { borderColor: dividerColor }]}>
                {section.items.map((link) => (
                  <Pressable
                    key={link.ref}
                    accessibilityRole="link"
                    onPress={() => {
                      if (link.href) {
                        Linking.openURL(link.href).catch(() => {});
                      }
                    }}
                    style={styles.linkRow}
                  >
                    <Text style={[styles.linkText, { color: palette.linkText }]}>{link.text}</Text>
                    <Text style={[styles.linkHint, { color: palette.paragraph }]}>
                      {link.href.replace(/^https?:\/\//, '')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </View>
  );
};

const createStyles = (tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    content: {
      gap: 18,
    },
    block: {
      gap: 10,
    },
    paragraph: {
      fontSize: 16,
      lineHeight: 24,
    },
    paragraphHeading: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '700',
    },
    subHeading: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 4,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    listText: {
      flex: 1,
      fontSize: 16,
      lineHeight: 24,
    },
    inlineStrong: {
      fontWeight: '700',
    },
    bulletSymbol: {
      fontSize: 20,
      lineHeight: 22,
    },
    numberSymbol: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '700',
      minWidth: 24,
    },
    linksBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: tones.grey.border,
      paddingVertical: 16,
    },
    linkRow: {
      paddingVertical: 10,
    },
    linkText: {
      fontSize: 16,
      fontWeight: '700',
    },
    linkHint: {
      fontSize: 13,
      marginTop: 2,
    },
    empty: {
      fontSize: 16,
      textAlign: 'center',
      paddingVertical: 48,
    },
  });

export default HelpTopicContent;
