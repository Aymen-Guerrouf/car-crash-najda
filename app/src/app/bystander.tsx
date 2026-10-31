import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Call14Button } from '../components/Call14Button';
import { useAlarm } from '../features/crash/useAlarm';
import { STRINGS, useDir, useT } from '../i18n/strings';
import { startBystanderFlow } from '../services/flows';
import { useProfileStore } from '../store/useProfileStore';
import { useReportStore } from '../store/useReportStore';
import { colors, FONT_FAMILY, radius } from '../theme/tokens';

const RED = colors.triage.RED;
const FLIP_MS = 500; // white <-> red, the two looks of the design

/**
 * Unresponsive victim (countdown ran out): the phone asks whoever is near for help. White page, big
 * "CETTE PERSONNE A EU UN ACCIDENT.", the victim's medical card, and a red "APPUYEZ N'IMPORTE OÙ" bar.
 * The alarm loops; the button breathes slowly (never strobes). Arabic is shown under each French line because
 * a stranger may read either. Online, the automatic alert is already sent; offline, the passer-by's tap leads
 * to the witness questions and the SMS (iOS needs a human to tap Send).
 */
export default function BystanderScreen() {
  const t = useT();
  const { row } = useDir();
  const draft = useReportStore((s) => s.draft);
  const profile = useProfileStore((s) => s.profile);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const [alarm, setAlarm] = useState(false); // false: white page, true: red page
  const [camera] = useCameraPermissions();
  useAlarm(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Switches between the two looks every 500 ms; stays on the white page when reduced motion is on
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setAlarm((a) => !a), FLIP_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  if (!draft) return <Redirect href="/" />;

  const fr = STRINGS.fr;
  const ar = STRINGS.ar;
  const hasMedical = profile.blood || profile.conditions.length > 0 || profile.allergies.length > 0;
  const who = [profile.age != null ? fr.yearsOld(profile.age) : null, profile.sex === 'M' ? fr.male : profile.sex === 'F' ? fr.female : null].filter(Boolean).join(' · ');
  const online = draft.mode === 'online';
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <SafeAreaView style={[styles.root, alarm && { backgroundColor: RED }]}>
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={[styles.tapIcon, alarm && { backgroundColor: colors.onDark }]}>
          <Ionicons name="hand-left-outline" size={30} color={RED} />
        </View>
        <Call14Button inverted={alarm} />
      </View>

      {/* The torch is a property of the camera view: a 1 px invisible view, lit on the red beat */}
      {camera?.granted && <CameraView style={styles.torch} enableTorch={alarm} facing="back" />}

      <Pressable accessibilityRole="button" accessibilityLabel={fr.bystanderTitle} onPress={startBystanderFlow} style={styles.body}>
        <AppText weight="extrabold" style={[styles.headline, { color: alarm ? colors.onDark : colors.ink, fontFamily: FONT_FAMILY.fr.extrabold, textAlign: 'left', writingDirection: 'ltr' }]}>
          {fr.bystanderTitle.toUpperCase()}.
        </AppText>
        <AppText weight="extrabold" color={alarm ? colors.ink : RED} style={[styles.help, { textAlign: 'left', writingDirection: 'ltr' }]}>
          {fr.bystanderTapHelp}
        </AppText>
        {/* the same message in Arabic for a stranger who reads it better */}
        <AppText variant="h2" weight="bold" color={alarm ? colors.onDark : colors.textMuted} style={{ fontFamily: FONT_FAMILY.ar.bold, textAlign: 'right', writingDirection: 'rtl' }}>
          {ar.bystanderTitle}. {ar.bystanderTapHelp}
        </AppText>

        <View style={styles.card}>
          <View style={[styles.cardTop, { flexDirection: row }]}>
            <AppText variant="caption" weight="semibold" color={colors.textMuted}>
              {fr.bystanderMedical}
            </AppText>
            {who !== '' && (
              <AppText variant="caption" weight="extrabold">
                {who}
              </AppText>
            )}
          </View>
          {hasMedical ? (
            <>
              <AppText weight="extrabold" style={styles.blood}>
                {profile.blood ?? '?'}
              </AppText>
              <View style={[styles.chips, { flexDirection: row }]}>
                {profile.conditions.map((c) => (
                  <View key={c} style={[styles.chip, { flexDirection: row }]}>
                    <Ionicons name="water-outline" size={15} color={colors.ink} />
                    <AppText variant="caption" weight="semibold">
                      {fr.conditionLabels[c]}
                    </AppText>
                  </View>
                ))}
                {profile.allergies.map((a) => (
                  <View key={a} style={[styles.chip, { flexDirection: row }]}>
                    <Ionicons name="warning-outline" size={15} color={colors.ink} />
                    <AppText variant="caption" weight="semibold">
                      {fr.allergyPrefix} : {fr.allergyLabels[a].toLowerCase()}
                    </AppText>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              {fr.bystanderNoProfile}
            </AppText>
          )}
          <AppText variant="overline" color={colors.textFaint} style={styles.saved}>
            {fr.bystanderSaved}
          </AppText>
        </View>

        <View style={[styles.sent, { flexDirection: row }]}>
          <Ionicons name={online ? 'checkmark' : 'cloud-offline-outline'} size={18} color={online ? colors.triage.GREEN : colors.triage.RED} />
          <AppText variant="caption" weight="bold" color={alarm ? colors.onDark : colors.ink} style={styles.flex}>
            {online ? fr.bystanderSent : fr.bystanderOffline}
          </AppText>
        </View>
      </Pressable>

      <Animated.View style={[styles.ctaWrap, { transform: [{ scale }] }]}>
        <Pressable accessibilityRole="button" onPress={startBystanderFlow} style={[styles.cta, { flexDirection: row }, alarm && { backgroundColor: colors.onDark }]}>
          <Ionicons name="hand-left-outline" size={22} color={alarm ? RED : colors.onDark} />
          <AppText weight="extrabold" color={alarm ? RED : colors.onDark}>
            {fr.bystanderAnywhere}
          </AppText>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  torch: { position: 'absolute', width: 1, height: 1, opacity: 0, top: 0, left: 0 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, minHeight: 72 },
  tapIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  headline: { fontSize: 40, lineHeight: 42 },
  help: { fontSize: 28, lineHeight: 34 },
  card: { marginTop: 8, backgroundColor: colors.surface, borderRadius: radius.big, padding: 18, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTop: { justifyContent: 'space-between', alignItems: 'center' },
  blood: { fontSize: 46, lineHeight: 52 },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 12, height: 34 },
  saved: { marginTop: 2 },
  sent: { alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  cta: { minHeight: 64, borderRadius: radius.pill, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
