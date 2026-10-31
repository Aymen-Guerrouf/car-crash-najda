import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { useDir } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Fixed-width grid cell (e.g. blood types) instead of a content-sized chip. */
  grow?: boolean;
  /** Small outline icon before the label (conditions in the profile form). */
  icon?: keyof typeof Ionicons.glyphMap;
}

/** Pill chip: warm grey at rest, black when chosen (profile form in the design). */
export function Chip({ label, selected, onPress, grow, icon }: Props) {
  const { row } = useDir();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { flexDirection: row }, grow && styles.grow, selected && styles.selected]}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.onDark : colors.ink} /> : selected && !grow ? <Ionicons name="checkmark" size={15} color={colors.onDark} /> : null}
      <AppText variant="caption" weight={selected ? 'bold' : 'semibold'} color={selected ? colors.onDark : colors.ink} center={grow}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', gap: 6 },
  grow: { flexBasis: '22%', flexGrow: 1 },
  selected: { backgroundColor: colors.ink },
});
