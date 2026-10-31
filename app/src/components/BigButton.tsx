import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useDir } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'danger' | 'neutral' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const BG: Record<Variant, string> = {
  primary: colors.ink, // black pill: the design's main action
  danger: colors.triage.RED,
  neutral: colors.surface2,
  ghost: 'transparent',
};
const FG: Record<Variant, string> = {
  primary: colors.onDark,
  danger: colors.onDark,
  neutral: colors.ink,
  ghost: colors.ink,
};

export function BigButton({ label, onPress, variant = 'primary', icon, loading, disabled, style }: Props) {
  const { row } = useDir();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.base, { backgroundColor: BG[variant], opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={FG[variant]} />
      ) : (
        <View style={[styles.content, { flexDirection: row }]}>
          {icon && <Ionicons name={icon} size={22} color={FG[variant]} />}
          <AppText weight="bold" color={FG[variant]} center>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  content: { alignItems: 'center', gap: 10 },
});
