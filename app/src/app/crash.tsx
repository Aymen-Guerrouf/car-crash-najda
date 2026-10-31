import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '../components/AppText';
import { Call14Button } from '../components/Call14Button';
import { LogoMark } from '../components/Logo';
import { useAlarm } from '../features/crash/useAlarm';
import { useDir, useT } from '../i18n/strings';
import { autoAlertFlow, showFlowError, startVictimFlow } from '../services/flows';
import { useDriveStore } from '../store/useDriveStore';
import { colors, radius } from '../theme/tokens';

const SECONDS = 10;
const RING = 250;
const STROKE = 16;
const RADIUS = (RING - STROKE) / 2;
const RED = colors.triage.RED;

/** Full red screen: "CHOC DÉTECTÉ", white countdown ring, black "J'ai besoin d'aide", white "Je vais bien". */
export default function CrashScreen() {
  const t = useT();
  const { row, language } = useDir();
  const [left, setLeft] = useState(SECONDS);
  const handled = useRef(false);
  const t0 = useRef(Date.now());
  useAlarm(true);

  // Count down against the wall clock so a busy JS thread can't stretch the 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setLeft(Math.max(0, SECONDS - Math.floor((Date.now() - t0.current) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // One heavy tick per second; the last second ends with the automatic alert
  useEffect(() => {
    if (handled.current) return;
    if (left > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      return;
    }
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    autoAlertFlow().catch((e) => {
      showFlowError(e, t);
      router.replace('/');
    });
  }, [left, t]);

  const needHelp = () => {
    if (handled.current) return;
    handled.current = true;
    startVictimFlow(true).catch((e) => {
      showFlowError(e, t);
      router.replace('/');
    });
  };

  const imOk = () => {
    if (handled.current) return;
    handled.current = true;
    useDriveStore.getState().countFalseAlarm();
    router.replace('/');
  };

  const circumference = 2 * Math.PI * RADIUS;
  const offset = circumference * (1 - left / SECONDS);
  const headline = language === 'fr' ? t.crashHeadline.toUpperCase() : t.crashHeadline;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={[styles.logo, { flexDirection: row }]}>
          <LogoMark size={26} color={colors.onDark} />
          <AppText variant="h2" weight="extrabold" color={colors.onDark}>
            {t.appName}
          </AppText>
        </View>
        <Call14Button inverted />
      </View>

      <View style={styles.body}>
        <View style={styles.titleBlock}>
          <AppText weight="extrabold" color={colors.onDark} style={styles.headline}>
            {headline}
          </AppText>
          <AppText weight="medium" color={colors.onDark}>
            {t.crashAsk}
          </AppText>
        </View>

        <View style={styles.ring}>
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke="#9A0014" strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={colors.onDark}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              rotation={-90}
              origin={`${RING / 2}, ${RING / 2}`}
            />
          </Svg>
          <AppText style={styles.seconds} weight="extrabold" color={colors.onDark} center>
            {left}
          </AppText>
          <AppText weight="semibold" color={colors.onDark} center>
            {t.secondsWord}
          </AppText>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={needHelp} style={[styles.btn, styles.btnDark, { flexDirection: row }]}>
            <Ionicons name="pulse" size={20} color={colors.onDark} />
            <AppText weight="bold" color={colors.onDark}>
              {t.needHelp}
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={imOk} style={[styles.btn, styles.btnLight, { flexDirection: row }]}>
            <Ionicons name="checkmark" size={20} color={colors.ink} />
            <AppText weight="bold">{t.imOk}</AppText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RED },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, minHeight: 56 },
  logo: { alignItems: 'center', gap: 10 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 14, justifyContent: 'space-between' },
  titleBlock: { gap: 8, paddingTop: 10 },
  headline: { fontSize: 38, lineHeight: 44 },
  ring: { width: RING, height: RING, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  seconds: { fontSize: 100, lineHeight: 108, fontVariant: ['tabular-nums'] },
  actions: { gap: 12 },
  btn: { minHeight: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnDark: { backgroundColor: colors.ink },
  btnLight: { backgroundColor: colors.onDark },
});
