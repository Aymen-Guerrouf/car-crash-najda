import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '../components/AppText';
import { FirstAidArt } from '../components/FirstAidArt';
import { Screen } from '../components/Screen';
import { firstAidFor } from '../content/firstAid';
import { SPEECH_LANG } from '../features/triage/questions';
import { useDir, useT } from '../i18n/strings';
import { useReportStore } from '../store/useReportStore';
import { colors, radius } from '../theme/tokens';

const GAP = 14;

/** One step: big number, icon that pops in when the card becomes the active one, the instruction. */
function StepCard({ index, total, text, setId, width, scrollX, active, onRead }: { index: number; total: number; text: string; setId: string; width: number; scrollX: Animated.Value; active: boolean; onRead: () => void }) {
  const t = useT();
  const { row } = useDir();
  const pop = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  // Cards slide up one after another when the set opens
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 420, delay: 90 * index, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  // The icon bounces whenever this card is the one in front
  useEffect(() => {
    if (!active) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [active, pop]);

  const center = index * (width + GAP);
  const scale = scrollX.interpolate({ inputRange: [center - width, center, center + width], outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' });
  const opacity = scrollX.interpolate({ inputRange: [center - width, center, center + width], outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' });
  const iconScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Animated.View
      style={[
        styles.card,
        { width, opacity: Animated.multiply(opacity, enter), transform: [{ scale }, { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] },
      ]}
    >
      <View style={[styles.cardTop, { flexDirection: row }]}>
        <View style={styles.numBadge}>
          <AppText weight="extrabold" color={colors.onDark} style={styles.num}>
            {index + 1}
          </AppText>
        </View>
        <AppText variant="caption" weight="bold" color={colors.textMuted}>
          {t.stepOfTotal(index + 1, total)}
        </AppText>
      </View>

      <Animated.View style={[styles.iconWrap, { transform: [{ scale: active ? iconScale : 1 }] }]}>
        <FirstAidArt id={setId} step={index} size={128} />
      </Animated.View>

      <AppText variant="h2" weight="extrabold" center style={styles.stepText}>
        {text}
      </AppText>

      <Pressable accessibilityRole="button" accessibilityLabel={t.firstAidSpeak} onPress={onRead} style={[styles.read, { flexDirection: row }]}>
        <Ionicons name="volume-high" size={18} color={colors.ink} />
        <AppText variant="caption" weight="bold">
          {t.firstAidSpeak}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/** Works fully offline: the content is bundled in the app and picked from the report's flags. */
export default function FirstAidScreen() {
  const t = useT();
  const { language, row } = useDir();
  const { width } = useWindowDimensions();
  const flags = useReportStore((s) => s.draft?.flags ?? []);
  const sets = useMemo(() => firstAidFor(flags), [flags]);
  const [setIndex, setSetIndex] = useState(0);
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void } | null>(null);

  const current = sets[setIndex] ?? sets[0]!;
  const steps = current.steps[language];
  const cardWidth = Math.min(width - 56, 420);

  useEffect(() => () => void Speech.stop(), []);

  // Switching set: back to its first step
  useEffect(() => {
    setPage(0);
    scrollX.setValue(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, [setIndex, scrollX]);

  const read = (i: number) => {
    Speech.stop();
    Speech.speak(steps[i] ?? '', { language: SPEECH_LANG[language], rate: 0.9 });
  };

  return (
    <Screen back header="logo" scroll>
      <AppText variant="h1" weight="extrabold">
        {t.firstAidTitle}
      </AppText>

      {sets.length > 1 && (
        <View style={[styles.tabs, { flexDirection: row }]}>
          {sets.map((s, i) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityState={{ selected: i === setIndex }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                Speech.stop();
                setSetIndex(i);
              }}
              style={[styles.tab, i === setIndex && styles.tabOn]}
            >
              <AppText variant="caption" weight="bold" color={i === setIndex ? colors.onDark : colors.ink}>
                {s.title[language]}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}

      <Animated.ScrollView
        ref={(r) => {
          scroller.current = r as unknown as typeof scroller.current;
        }}
        key={`${current.id}-${language}`}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: (width - cardWidth) / 2, paddingVertical: 8 }}
        style={styles.carousel}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + GAP));
          if (p !== page) {
            setPage(p);
            Haptics.selectionAsync().catch(() => {});
            Speech.stop();
          }
        }}
      >
        {steps.map((text, i) => (
          <StepCard
            key={`${current.id}-${i}`}
            index={i}
            total={steps.length}
            text={text}
            setId={current.id}
            width={cardWidth}
            scrollX={scrollX}
            active={i === page}
            onRead={() => read(i)}
          />
        ))}
      </Animated.ScrollView>

      <View style={styles.dots}>
        {steps.map((_, i) => {
          const center = i * (cardWidth + GAP);
          const range = [center - cardWidth, center, center + cardWidth];
          // scaleX/opacity only: `width` is not supported by the native animated module
          const scaleX = scrollX.interpolate({ inputRange: range, outputRange: [1, 3.2, 1], extrapolate: 'clamp' });
          const o = scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[styles.dot, { opacity: o, transform: [{ scaleX }] }]} />;
        })}
      </View>

      <AppText variant="caption" color={colors.textFaint} center>
        {t.firstAidNote}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexWrap: 'wrap', gap: 8 },
  tab: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.ink },
  carousel: { marginHorizontal: -20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.big, paddingVertical: 22, paddingHorizontal: 20, gap: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  cardTop: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between' },
  numBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 20, lineHeight: 24 },
  iconWrap: { width: 156, height: 156, borderRadius: 78, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  stepText: { minHeight: 90, lineHeight: 28 },
  read: { alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  dots: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink, marginHorizontal: 8 },
});
