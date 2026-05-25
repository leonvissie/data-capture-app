import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Animated, Linking, Share, ScrollView } from 'react-native';
import Screen from '../../src/components/Screen';
import { useTones } from '../../src/theme/tones';
import { TAB_SPACING } from '../../src/theme/spacing';
import Constants from 'expo-constants';
import TabScrollView from '../../src/components/TabScrollView';
import pricingConfig from '../../src/config/pricing.json';
import { useLocalSearchParams } from 'expo-router';
import { useCollapsedPanels } from '../../src/hooks/useCollapsedPanels';
import { Bullet, LinkText, P as InfoP, Txt as InfoTxt } from '../../src/components/InfoText';
import CollapseToggleChip from '../../src/components/CollapseToggleChip';

type PricingInfoItem = {
  id: string;
  label: string;
  infoText?: string | string[];
  isActive?: boolean;
};

const getActivePricingInfoItems = (): PricingInfoItem[] => {
  const tieredItems = pricingConfig.products?.tieredPricing?.isActive
    ? pricingConfig.products?.tieredPricing?.items ?? []
    : [];
  const perItemItems = pricingConfig.products?.perItemPricing?.isActive
    ? pricingConfig.products?.perItemPricing?.items ?? []
    : [];

  return [...tieredItems, ...perItemItems].filter((item) => item.isActive !== false);
};

const stripHtml = (value: string) => value.replace(/<\/?[^>]+>/g, '').trim();

type InlineSegment = {
  text: string;
  strong?: boolean;
};

type HtmlBlock =
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'list'; items: InlineSegment[][] };

const parseInlineSegments = (value: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  const pattern = /<(strong|b)>(.*?)<\/\1>/gis;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const before = value.slice(lastIndex, match.index).replace(/<\/?[^>]+>/g, '');
    if (before) segments.push({ text: before });
    const strongText = match[2].replace(/<\/?[^>]+>/g, '');
    if (strongText) segments.push({ text: strongText, strong: true });
    lastIndex = match.index + match[0].length;
  }

  const tail = value.slice(lastIndex).replace(/<\/?[^>]+>/g, '');
  if (tail) segments.push({ text: tail });

  return segments.filter((segment) => segment.text.trim().length > 0);
};

const parseHtmlBlocks = (value?: string | string[]): HtmlBlock[] => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join('') : value;
  const normalized = raw.trim();
  if (!normalized) return [];

  const listMatch = normalized.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (listMatch) {
    const items: InlineSegment[][] = [];
    const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemPattern.exec(listMatch[1])) !== null) {
      const segments = parseInlineSegments(itemMatch[1]);
      if (segments.length > 0) items.push(segments);
    }
    if (items.length > 0) {
      return [{ type: 'list', items }];
    }
  }

  const paragraphs = normalized
    .split(/<br\s*\/?>/i)
    .map((part) => parseInlineSegments(part))
    .filter((segments) => segments.length > 0);

  return paragraphs.map((segments) => ({ type: 'paragraph', segments }));
};

type CollapsibleSectionProps = {
  heading: string;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  accent: string;
};

const CollapsibleSection = ({
  heading,
  children,
  open: controlledOpen,
  onToggle,
  styles,
  accent,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const isControlled = typeof controlledOpen === 'boolean';
  const resolvedOpen = isControlled ? controlledOpen : open;

  useEffect(() => {
    if (!isControlled) return;
    if (controlledOpen && !open) {
      setOpen(true);
      setRender(true);
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    if (!controlledOpen && open) {
      Animated.timing(contentOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setRender(false);
      });
      setOpen(false);
    }
  }, [contentOpacity, controlledOpen, isControlled, open]);

  const toggle = () => {
    const next = !resolvedOpen;
    if (!isControlled) {
      setOpen(next);
    } else {
      onToggle?.(next);
    }
    if (next) setRender(true);
    Animated.timing(contentOpacity, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !next) setRender(false);
    });
  };

  return (
    <View style={{ marginBottom: TAB_SPACING }}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        <Text style={styles.h2}>{heading}</Text>
        <CollapseToggleChip
          expanded={resolvedOpen}
          onPress={toggle}
          tone="purple"
          backgroundColor="transparent"
          borderColor={accent}
          textColor={accent}
          iconColor={accent}
          style={styles.sectionToggleChip}
        />
      </Pressable>
      {render ? (
        <Animated.View style={{ opacity: contentOpacity }}>
          <View style={styles.sectionBodyCard}>
            {children}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
};

export default function InfoTab() {
  const tones = useTones();
  const neutral = tones.grey;
  const accent = tones.purple.base;
  const border = tones.purple.border;
  const params = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [supportY, setSupportY] = useState<number | null>(null);
  const { collapsed, setSectionCollapsed } = useCollapsedPanels('info', [
    'tutorials',
    'resources',
    'security',
    'whatItDoes',
    'howItDoesIt',
    'whatYouGet',
    'howItWorks',
    'pricing',
    'support',
  ]);
  const supportOpen = params.section === 'support' ? true : !collapsed.support;

  useEffect(() => {
    if (params.section !== 'support') return;
    if (!supportOpen || supportY === null) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, supportY - 12), animated: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [params.section, supportOpen, supportY]);
  const styles = useMemo(() => createStyles(neutral, accent, border), [neutral, accent, border]);
  // const APP_ENV =
  //   (Constants?.expoConfig as any)?.extra?.APP_ENV ??
  //   (Constants as any)?.manifest?.extra?.APP_ENV ??
  //   'dev';
  const version =
    (Constants?.expoConfig as any)?.version ??
    'unknown';

  const P = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <InfoP baseStyle={styles.p} style={style}>{children}</InfoP>
  );

  const Txt = ({ children }: { children: React.ReactNode }) => (
    <InfoTxt style={styles.em}>{children}</InfoTxt>
  );

  const renderInlineSegments = (segments: InlineSegment[]) => (
    <>
      {segments.map((segment, index) => (
        segment.strong ? (
          <Txt key={`${segment.text}-${index}`}>{segment.text}</Txt>
        ) : (
          <React.Fragment key={`${segment.text}-${index}`}>{segment.text}</React.Fragment>
        )
      ))}
    </>
  );

  const renderHtmlBlocks = (blocks: HtmlBlock[], keyPrefix: string) => (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <View key={`${keyPrefix}-list-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
              {block.items.map((itemSegments, itemIndex) => (
                <Bullet
                  key={`${keyPrefix}-item-${itemIndex}`}
                  containerStyle={styles.liRow}
                  dotStyle={styles.liDot}
                  textStyle={styles.li}
                >
                  {renderInlineSegments(itemSegments)}
                </Bullet>
              ))}
            </View>
          );
        }

        return (
          <P key={`${keyPrefix}-paragraph-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
            {renderInlineSegments(block.segments)}
          </P>
        );
      })}
    </>
  );

  const Meta = () => {
    const APP_ENV =
      (Constants?.expoConfig as any)?.extra?.APP_ENV ??
      (Constants as any)?.manifest?.extra?.APP_ENV ??
      'dev';
    return (
      <View style={styles.meta}>
        {/* <Text style={styles.metaText}>
          APP_ENV: <Text style={styles.metaVal}>{APP_ENV}</Text>
        </Text>
        <Text style={styles.metaText}>
          Version: <Text style={styles.metaVal}>{version}</Text>
        </Text>*/}
      </View>
    );
  };
  return (
    <Screen>
      <TabScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.h1}>About GunCerts</Text>
        {/* <Meta /> */}

        <P style={[styles.h2, { color: tones.grey.base }]}>
          <Txt>App version: {version}</Txt>
        </P>

        <View onLayout={(event) => setSupportY(event.nativeEvent.layout.y)}>
          <CollapsibleSection
            heading="Support & feedback"
            open={supportOpen}
            onToggle={(next) => setSectionCollapsed('support', !next)}
            styles={styles}
            accent={accent}
          >
            <P>
              If you spot a bug or have suggestions, please use the 
              feedback via the <Txt>"Share feedback"</Txt> option in the <Txt>Settings</Txt> tab.
            </P>          
            <P style={{ marginTop: 12 }}>
              You can also <LinkText href="https://wa.me/message/V2YD7CRXYB4QO1" style={[styles.em, styles.link]} onPressLink={openLink}>contact us on WhatsApp</LinkText>.
            </P>
            {/* <P style={{ marginTop: 12 }}>
              Alternatively contact us via email: <LinkText href="mailto:support@guncerts.co.za" style={[styles.em, styles.link]} onPressLink={openLink}>support@guncerts.co.za</LinkText>
            </P>      */}
          </CollapsibleSection>
        </View>

        <CollapsibleSection
          heading="Tutorials"
          open={!collapsed.tutorials}
          onToggle={(next) => setSectionCollapsed('tutorials', !next)}
          styles={styles}
          accent={accent}
        >
          <P>Not sure where to start?</P>
          <P style={{ marginTop: 12 }}>
            Have a look at our Tutorial videos on the{' '}
            <LinkText
              href="https://www.youtube.com/playlist?list=PLE_nK0ZpxCN1g1FRxie6jXenCBvo0pacH"
              style={[styles.em, styles.link]}
              onPressLink={openLink}
            >
              GunCerts YouTube channel
            </LinkText>
            .
          </P>
        </CollapsibleSection>

        <CollapsibleSection
          heading="Government resources"
          open={!collapsed.resources}
          onToggle={(next) => setSectionCollapsed('resources', !next)}
          styles={styles}
          accent={accent}
        >
          <P>
            <Txt>Important notice: GunCerts</Txt> is a private, independent application and does not represent SAPS or any
            government entity.
          </P>
          <P style={{ marginTop: 12 }}>
            <Txt>GunCerts assists with application preparation only</Txt>. Submission, approval, and processing are handled solely
            by SAPS.
          </P>
          <P style={{ marginTop: 12 }}>
            Information about firearm licence applications and forms is based on publicly available information from the
            South African Police Service (SAPS):
          </P>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}>
            South African Police Service (SAPS): <LinkText href="https://www.saps.gov.za" style={[styles.em, styles.link]} 
            onPressLink={openLink}>https://www.saps.gov.za</LinkText>
          </Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}>
            SAPS Firearm Licence application forms (SAPS 517(g), SAPS 518(a)):{'\n'}
            {/* <LinkText href="https://www.saps.gov.za/services/flash/firearms/formseng.php" style={[styles.em, styles.link]} 
            onPressLink={openLink}>SAPS page for all firearm applications forms</LinkText> */}
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}>
            <LinkText href="https://www.saps.gov.za/services/flash/firearms/forms/english/e517g.pdf" style={[styles.em, styles.link]} 
            onPressLink={openLink}>Competency renewal: SAPS-517(g) PDF.</LinkText>
          </Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}>
            <LinkText href="https://www.saps.gov.za/services/flash/firearms/forms/english/e518a.pdf" style={[styles.em, styles.link]} 
            onPressLink={openLink}>Firearm renewal: SAPS-518(a) PDF.</LinkText>
          </Bullet>
          </Bullet>


          
          <P style={{ marginTop: 12 }}>
            Users should always refer to SAPS directly for the most current requirements and official submission
            processes.
          </P>
        </CollapsibleSection>

        <CollapsibleSection
          heading="What it does"
          open={!collapsed.whatItDoes}
          onToggle={(next) => setSectionCollapsed('whatItDoes', !next)}
          styles={styles}
          accent={accent}
        >
          <P>
            This app helps you prepare SAPS firearm-related applications easily using only your phone. 
          </P>
          <P style={{ marginTop: 12 }}>
            Currently supported application types are:
          </P>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Competency Certificate Renewal (SAPS-517(g))</Txt>; and </Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Section 13, 15 & 16 Firearm Licence Renewal (SAPS-518(a))</Txt>.</Bullet>
          <P style={{ marginTop: 12 }}>
            We will add new application types as we grow.
          </P>

        </CollapsibleSection>

        <CollapsibleSection
          heading="What you get"
          open={!collapsed.whatYouGet}
          onToggle={(next) => setSectionCollapsed('whatYouGet', !next)}
          styles={styles}
          accent={accent}
        >
          <P>
            Once all required documents and information are collected, the app generates:
          </P>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>a completed application form</Txt>;</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>a supporting document bundle</Txt>;</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>an application checklist</Txt>.</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>a motivation letter (optional extra)</Txt>.</Bullet>
          {/* <P style={{ marginTop: 12, color: tones.red.base }}><Txt>NOTE:</Txt> Currently we do not provide functionality for 
            creating motivations.</P> */}
        </CollapsibleSection>

        <CollapsibleSection
          heading="How it works"
          open={!collapsed.howItWorks}
          onToggle={(next) => setSectionCollapsed('howItWorks', !next)}
          styles={styles}
          accent={accent}
        >
          <P>
            The app uses your phone's <Txt>built-in capabilities</Txt> to capture, extract and generate
            the information required for your application.
          </P>
          {/* <P style={{ marginTop: 12 }}>
            Easily capture your documents using your phone's camera or photo library.
          </P> */}
          <P style={{ marginTop: 12 }}>
            The app uses <Txt>on-device text extraction capability</Txt> to extract key information from your documents.
          </P>
          <P style={{ marginTop: 12 }}>
            Alternatively you can upload files stored in other locations
            using the file upload functionality.
          </P>
          <P style={{ marginTop: 12 }}>
            The process for completing an application is easy!
          </P>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Capture</Txt> the required information using your phone.</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Review</Txt> the draft application.</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Finalise</Txt> your application.</Bullet>
          <Bullet containerStyle={styles.liRow} dotStyle={styles.liDot} textStyle={styles.li}><Txt>Download</Txt> your application.</Bullet>
        </CollapsibleSection>

        <CollapsibleSection
          heading="Pricing"
          open={!collapsed.pricing}
          onToggle={(next) => setSectionCollapsed('pricing', !next)}
          styles={styles}
          accent={accent}
        >
          <P><Txt>It is free to upload, store and manage your firearm-related documents on the GunCerts app.</Txt></P>
          <P> </P>
          <P>Payment is only required if you create an application using the GunCerts app.</P>
          <P> </P>
          <P><Txt>Below is a breakdown of our simple and transparent pricing structure.</Txt></P>
          
          {getActivePricingInfoItems().map((item) => {
            const labelBlocks = parseHtmlBlocks(item.label);
            const infoBlocks = parseHtmlBlocks(item.infoText);
            const labelText = stripHtml(item.label);

            return (
              <View key={item.id} style={{ marginTop: 2 }}>
                {labelBlocks.length > 0 ? (
                  renderHtmlBlocks(labelBlocks, `${item.id}-label`)
                ) : (
                  <P>
                    <Txt>{labelText}</Txt>
                  </P>
                )}
                {infoBlocks.length > 0 ? renderHtmlBlocks(infoBlocks, `${item.id}-info`) : null}
              </View>
            );
          })}
        </CollapsibleSection>

        <CollapsibleSection
          heading="Security & privacy"
          open={!collapsed.security}
          onToggle={(next) => setSectionCollapsed('security', !next)}
          styles={styles}
          accent={accent}
        >
          <P>
            All your data is <Txt>stored</Txt> and <Txt>encrypted</Txt> on your device. 
            That means you have <Txt>full control</Txt> over 
            your data as it <Txt>doesn't leave your device</Txt>.
          </P>
          <P style={{ marginTop: 12 }}>
            You can read our full privacy policy on our website at{' '}
            <LinkText href="https://www.guncerts.co.za/privacy.html" style={[styles.em, styles.link]} onPressLink={openLink}>
              https://www.guncerts.co.za/privacy.html
            </LinkText>
          </P>
          <P style={{ marginTop: 12 }}>
            We don't use cookies or any tracking technologies on our app or website.
          </P>
        </CollapsibleSection>


        {/* <Meta /> */}
      </TabScrollView>
    </Screen>
  );
}

async function openLink(href: string) {
  if (href.startsWith('mailto:')) {
    if (Platform.OS === 'ios') {
      await Share.share({ url: href });
      return;
    }
    await Share.share({ url: href, message: href });
    return;
  }
  await Linking.openURL(href);
}

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  accent: string,
  lightBlueBorder: string,
) =>
  StyleSheet.create({
    content: { gap: TAB_SPACING },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: TAB_SPACING },
    h2: { fontSize: 18, fontWeight: '800', color: accent },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 6,
      marginBottom: 6,
    },
    sectionToggleChip: {},
    sectionBodyCard: {
      backgroundColor: neutral.onBase,
      borderWidth: 1,
      borderColor: lightBlueBorder,
      borderRadius: 16,
      padding: 16,
    },
    p: { fontSize: 15, lineHeight: 22, color: neutral.onSurface },
    em: { fontWeight: '700' },
    link: { textDecorationLine: 'underline' },

    liRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    liDot: { color: accent, marginTop: 2 },
    li: { flex: 1, color: neutral.onSurface, lineHeight: 20 },

    meta: {
      marginBottom: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderTopColor: neutral.border,
      borderBottomColor: neutral.border,
      paddingTop: 10,
      paddingBottom: 10,
      flexDirection: 'row',
      gap: 18,
    },
    metaText: { color: neutral.base },
    metaVal: { color: neutral.onSurface, fontWeight: '700' },
  });
