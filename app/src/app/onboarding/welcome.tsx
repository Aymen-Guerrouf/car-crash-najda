import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { Illustration } from '../../components/Illustration';
import { Logo } from '../../components/Logo';
import { useDir, useT } from '../../i18n/strings';
import { colors } from '../../theme/tokens';

const PARAMEDIC = require('../../../assets/illustrations/paramedic.png');
const PARAMEDIC_RATIO = 527 / 390; // exported frame of the design: full width, anchored to the bottom

/** First screen, as in the design: logo, "Une aide rapide après SOS un accident", the paramedic, one white pill. */
export default function WelcomeScreen() {
  const t = useT();
  const { row, rtl } = useDir();
  const { width } = useWindowDimensions();
  const start = () => router.push('/onboarding/profile');

  return (
    <View style={styles.root}>
      {/* the paramedic fills the width and sits behind the button, cut by the bottom edge */}
      <Image source={PARAMEDIC} style={{ position: 'absolute', left: 0, bottom: 0, width, height: width * PARAMEDIC_RATIO }} resizeMode="cover" />

      <SafeAreaView style={styles.safe}>
        <View style={styles.logo}>
          <Logo compact />
        </View>

        <View style={styles.title}>
          <AppText style={styles.h} weight="medium">{t.welcomeLine1}</AppText>
          <View style={[styles.inline, { flexDirection: row }]}>
            <AppText style={styles.h} weight="medium">{t.welcomeLine2a}</AppText>
            <Illustration name="sos" size={64} />
            {t.welcomeLine2b !== '' && <AppText style={styles.h} weight="medium">{t.welcomeLine2b}</AppText>}
          </View>
          <AppText style={styles.h} weight="medium">{t.welcomeLine3}</AppText>
        </View>

        <View style={styles.flex} />

        <Pressable accessibilityRole="button" accessibilityLabel={t.welcomeCta} onPress={start} style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.92 : 1 }]}>
          <View style={[styles.ctaIcon, rtl ? styles.iconEnd : styles.iconStart]}>
            <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={26} color={colors.onDark} />
          </View>
          <AppText weight="extrabold" center style={styles.ctaLabel}>
            {t.welcomeCta}
          </AppText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: 24 },
  flex: { flex: 1 },
  logo: { paddingTop: 10, height: 52, justifyContent: 'center' },
  title: { marginTop: 40, gap: 0 },
  h: { fontSize: 42, lineHeight: 48, letterSpacing: -0.5 },
  inline: { alignItems: 'center', gap: 2 },
  cta: { height: 72, borderRadius: 36, backgroundColor: colors.surface, justifyContent: 'center', marginBottom: 14 },
  ctaIcon: { position: 'absolute', top: 4, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  iconStart: { left: 4 },
  iconEnd: { right: 4 },
  ctaLabel: { fontSize: 18 },
});
