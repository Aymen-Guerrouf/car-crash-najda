import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Giant numeral for single-question screens; compact for rows of counters. */
  large?: boolean;
}

/** Outline "−", big number, black "+": the counter of the design. Always laid out left to right. */
export function Stepper({ value, onChange, min = 0, max = 99, large }: Props) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  const btn = large ? 72 : 52;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="−"
        disabled={value <= min}
        onPress={() => step(-1)}
        style={[styles.btn, styles.minus, { width: btn, height: btn, borderRadius: btn / 2 }, value <= min && styles.off]}
      >
        <Ionicons name="remove" size={large ? 30 : 24} color={colors.ink} />
      </Pressable>
      <AppText variant="display" weight="extrabold" center style={[styles.value, large && styles.valueLarge]}>
        {value}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+"
        disabled={value >= max}
        onPress={() => step(1)}
        style={[styles.btn, styles.plus, { width: btn, height: btn, borderRadius: btn / 2 }, value >= max && styles.off]}
      >
        <Ionicons name="add" size={large ? 30 : 24} color={colors.onDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  btn: { alignItems: 'center', justifyContent: 'center' },
  minus: { borderWidth: 2.5, borderColor: colors.ink, backgroundColor: 'transparent' },
  plus: { backgroundColor: colors.ink },
  off: { opacity: 0.3 },
  value: { minWidth: 48, fontVariant: ['tabular-nums'] },
  valueLarge: { minWidth: 96, fontSize: 96, lineHeight: 108 },
});
