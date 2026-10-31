import { Pressable, StyleSheet, View } from 'react-native';
import { useDir } from '../i18n/strings';
import { useProfileStore } from '../store/useProfileStore';
import { colors } from '../theme/tokens';
import type { Language } from '../types';
import { AppText } from './AppText';

const OPTIONS: { code: Language; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'ع' },
];

export function LangSwitch() {
  const { language } = useDir();
  const setLanguage = useProfileStore((s) => s.setLanguage);
  return (
    <View style={styles.wrap}>
      {OPTIONS.map((o) => {
        const active = o.code === language;
        return (
          <Pressable key={o.code} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setLanguage(o.code)} style={[styles.seg, active && styles.segActive]}>
            <AppText variant="caption" weight="bold" center color={active ? colors.onDark : colors.ink}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 999, padding: 3, height: 44 },
  seg: { minWidth: 40, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.ink },
});
