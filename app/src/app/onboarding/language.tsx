import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { BrandLogo } from '../../components/BrandLogo';
import { STRINGS, useDir } from '../../i18n/strings';
import { useProfileStore } from '../../store/useProfileStore';
import { FONT_FAMILY, colors, radius } from '../../theme/tokens';
import type { Language } from '../../types';

const OPTIONS: { code: Language; name: string; hint: string }[] = [
  { code: 'ar', name: 'العربية', hint: 'Arabe' },
  { code: 'fr', name: 'Français', hint: 'Français' },
];

/** Very first screen: which language should the whole app speak? Arabic (right-to-left) or French. */
export default function LanguageScreen() {
  const { language } = useDir();
  const setLanguage = useProfileStore((s) => s.setLanguage);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <BrandLogo width={200} />
      </View>

      {/* both languages at once: we do not know yet which one the user reads */}
      <View style={styles.titles}>
        <AppText style={[styles.title, { fontFamily: FONT_FAMILY.ar.bold, textAlign: 'right', writingDirection: 'rtl' }]}>اختر لغة التطبيق</AppText>
        <AppText style={[styles.title, { fontFamily: FONT_FAMILY.fr.bold, textAlign: 'left', writingDirection: 'ltr' }]}>Choisissez la langue</AppText>
      </View>

      <View style={styles.list}>
        {OPTIONS.map((o) => {
          const active = o.code === language;
          return (
            <Pressable
              key={o.code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setLanguage(o.code)}
              style={[styles.option, active && styles.optionOn]}
            >
              <AppText style={{ fontSize: 26, lineHeight: 36, fontFamily: FONT_FAMILY[o.code].bold, writingDirection: o.code === 'ar' ? 'rtl' : 'ltr' }}>
                {o.name}
              </AppText>
              <View style={[styles.radio, active && styles.radioOn]}>{active && <Ionicons name="checkmark" size={18} color={colors.onDark} />}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.flex} />

      <BigButton label={STRINGS[language].continue} onPress={() => router.push('/onboarding/welcome')} style={styles.cta} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  flex: { flex: 1 },
  hero: { paddingTop: 24, alignItems: 'center' },
  titles: { marginTop: 28, gap: 4 },
  title: { fontSize: 32, lineHeight: 42, color: colors.ink },
  list: { marginTop: 36, gap: 14 },
  option: { height: 88, borderRadius: radius.big, backgroundColor: colors.surface, borderWidth: 2, borderColor: 'transparent', paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionOn: { borderColor: colors.ink },
  radio: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  cta: { marginBottom: 14 },
});
