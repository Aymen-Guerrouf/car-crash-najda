import { Ionicons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useForegroundPermissions } from 'expo-location';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { endCrashSession } from '../features/crash/crashSession';
import { SensorSparkline } from '../features/crash/SensorSparkline';
import { THRESHOLDS } from '../features/crash/detector';
import { triggerCrash } from '../features/crash/triggerCrash';
import { useDir, useT } from '../i18n/strings';
import { showFlowError, sosFlow } from '../services/flows';
import { requestLocationPermission } from '../services/location';
import { useDriveStore } from '../store/useDriveStore';
import { useProfileStore } from '../store/useProfileStore';
import { colors, radius } from '../theme/tokens';

const SOS_SIZE = 172;

/** Expanding ring behind the SOS button; two of them, offset, give a calm "radar" pulse. */
function PulseRing({ delay, still }: { delay: number; still: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, still, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: still ? [0.12, 0.12] : [0.28, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: still ? [1.3, 1.3] : [1, 1.7] }) }],
        },
      ]}
    />
  );
}

/** Small status chip: "GPS ✓", "Internet", "Conduite activée". */
function Chip({ label, ok }: { label: string; ok: boolean }) {
  const { row } = useDir();
  return (
    <View style={[styles.chip, { flexDirection: row }]}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.triage.GREEN : colors.textFaint} />
      <AppText variant="caption" weight="semibold">
        {label}
      </AppText>
    </View>
  );
}

/** Live graph + status line. Only this component follows the 10 Hz samples, never the whole home screen. */
function SensorBody({ on, width }: { on: boolean; width: number }) {
  const t = useT();
  const samples = useDriveStore((s) => s.samples);
  const peak = on && samples.some((g) => g > THRESHOLDS.impactAfterFallG);
  return (
    <>
      <SensorSparkline samples={on ? samples : []} width={width} height={52} />
      <AppText variant="caption" color={colors.textFaint}>
        {peak ? t.sensorPeak : t.sensorIdle}
      </AppText>
    </>
  );
}
export default function HomeScreen() {
  const t = useT();
  const { row, rtl } = useDir();
  const { width } = useWindowDimensions();
  const onboarded = useProfileStore((s) => s.onboarded);
  const net = useNetInfo();
  const [permission] = useForegroundPermissions();
  const sending = false; // the SOS opens the next screen at once, there is no pending state
  const [reduceMotion, setReduceMotion] = useState(false);
  // Selectors, not the whole store: the live samples change 10x/s and must not re-render the home screen
  const driveOn = useDriveStore((s) => s.on);
  const setDriveOn = useDriveStore((s) => s.setOn);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Back on Home: any previous crash flow is over, detection may fire again (after a short quiet period)
  useFocusEffect(
    useCallback(() => {
      useDriveStore.getState().setBusy(false);
      if (endCrashSession()) useDriveStore.getState().setQuietUntil(Date.now() + 30_000);
    }, []),
  );

  if (!onboarded) return <Redirect href="/onboarding/language" />;

  const online = net.isConnected !== false;

  const onDriveToggle = (v: boolean) => {
    setDriveOn(v);
    if (v && !permission?.granted) void requestLocationPermission();
  };

  // Opens the role screen immediately; the alert is created in the background
  const onSos = () => sosFlow((e) => showFlowError(e, t));

  // Hidden demo trigger: three quick taps on the logo call the exact function the sensor calls
  const onLogoPress = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 800), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      triggerCrash('manual');
    }
  };

  return (
    <Screen header="logo" profile scroll={false} onLogoPress={onLogoPress}>
      <View style={styles.body}>
        <Card style={styles.driveCard}>
          <View style={[styles.driveHead, { flexDirection: row }]}>
            <View style={styles.flex}>
              <AppText weight="bold">{t.driveTitle}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {t.driveSub}
              </AppText>
            </View>
            <Switch value={driveOn} onValueChange={onDriveToggle} trackColor={{ false: colors.surface3, true: colors.triage.GREEN }} ios_backgroundColor={colors.surface3} />
          </View>
          <View style={[styles.chips, { flexDirection: row }]}>
            <Chip label={t.chipGps} ok={!!permission?.granted} />
            <Chip label={t.chipNet} ok={online} />
            {driveOn && <Chip label={t.driveChipOn} ok />}
          </View>
          {driveOn && <SensorBody on width={Math.min(width, 440) - 76} />}
        </Card>

        <View style={styles.sosArea}>
          <PulseRing delay={0} still={reduceMotion || sending} />
          <PulseRing delay={1300} still={reduceMotion || sending} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.sos}
            onPress={onSos}
            disabled={sending}
            style={({ pressed }) => [styles.sos, { transform: [{ scale: pressed ? 0.96 : 1 }], opacity: sending ? 0.75 : 1 }]}
          >
            <AppText variant="display" weight="extrabold" color={colors.onDark} center style={styles.sosLabel}>
              {sending ? t.sosSending : t.sos}
            </AppText>
          </Pressable>
        </View>

        <View style={styles.hint}>
          <AppText variant="h2" weight="extrabold" center>
            {t.sosTitle}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} center>
            {t.sosExplainNew}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 8, gap: 12, justifyContent: 'space-between' },
  driveCard: { gap: 12, paddingVertical: 14, borderRadius: radius.big },
  driveHead: { alignItems: 'center', gap: 12 },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 12, height: 32 },
  sensorCard: { gap: 8, paddingVertical: 14 },
  thresholds: { alignItems: 'flex-end' },
  sosArea: { alignItems: 'center', justifyContent: 'center', height: SOS_SIZE * 1.5 },
  ring: { position: 'absolute', width: SOS_SIZE, height: SOS_SIZE, borderRadius: SOS_SIZE / 2, backgroundColor: colors.triage.RED },
  sos: {
    width: SOS_SIZE,
    height: SOS_SIZE,
    borderRadius: SOS_SIZE / 2,
    backgroundColor: colors.triage.RED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: colors.surface,
    shadowColor: colors.triage.RED,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  sosLabel: { letterSpacing: 2 },
  hint: { gap: 6, paddingBottom: 6 },
});
