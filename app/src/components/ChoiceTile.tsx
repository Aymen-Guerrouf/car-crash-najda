import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

interface Props {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  /** "None" style: grey tile that turns darker instead of red when chosen. */
  neutral?: boolean;
}

/** White selectable tile with an outline icon; red border + check badge when chosen (hazards, body, etc.). */
export function ChoiceTile({ label, icon, selected, onPress, neutral }: Props) {
  const accent = neutral ? colors.ink : colors.triage.RED;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tile, neutral && styles.neutral, selected && { borderColor: accent, borderWidth: 2 }, neutral && selected && { backgroundColor: colors.surface3 }]}
    >
      {selected && (
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Ionicons name="checkmark" size={14} color={colors.onDark} />
        </View>
      )}
      <Ionicons name={icon} size={30} color={selected ? accent : colors.ink} />
      <AppText weight="bold" center color={selected ? accent : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 118, borderRadius: radius.big - 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
  neutral: { backgroundColor: colors.surface2, borderColor: 'transparent' },
  badge: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
