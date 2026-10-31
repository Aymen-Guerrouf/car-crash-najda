import { StyleSheet, View } from 'react-native';
import { useDir } from '../i18n/strings';
import { colors } from '../theme/tokens';

/** Thin black-on-grey progress bar at the top of the question screens. `value` is 0..1. */
export function ProgressBar({ value }: { value: number }) {
  const { row } = useDir();
  return (
    <View style={[styles.track, { flexDirection: row }]}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.ink },
});
