import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

/** Giant OUI (green, check) / NON (red, cross) tiles. Always icon + word, never colour alone. */
export function AnswerTile({ kind, label, onPress }: { kind: 'yes' | 'no'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: kind === 'yes' ? colors.triage.GREEN : colors.triage.RED, opacity: pressed ? 0.88 : 1 }]}
    >
      <Ionicons name={kind === 'yes' ? 'checkmark' : 'close'} size={40} color={colors.onDark} />
      <AppText variant="display" weight="extrabold" color={colors.onDark} center>
        {label.toUpperCase()}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: 150, borderRadius: radius.big + 4, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
