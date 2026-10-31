import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useDir, useT } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

/** Red pill, top right of every emergency screen (design: "Appeler le 14"). */
export function Call14Button({ inverted }: { inverted?: boolean }) {
  const t = useT();
  const { row } = useDir();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.call14}
      onPress={() => Linking.openURL('tel:14')}
      style={({ pressed }) => [styles.pill, { flexDirection: row, opacity: pressed ? 0.85 : 1 }, inverted && { backgroundColor: colors.onDark }]}
    >
      <Ionicons name="call-outline" size={17} color={inverted ? colors.triage.RED : colors.onDark} />
      <AppText variant="caption" weight="bold" color={inverted ? colors.triage.RED : colors.onDark}>
        {t.call14}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { backgroundColor: colors.triage.RED, borderRadius: radius.pill, paddingHorizontal: 16, height: 44, alignItems: 'center', gap: 8 },
});
