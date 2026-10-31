import { StyleSheet, View } from 'react-native';
import { useDir, useT } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import type { Triage } from '../types';
import { AppText } from './AppText';

export function TriageBadge({ triage }: { triage: Triage }) {
  const t = useT();
  const { row } = useDir();
  return (
    <View style={[styles.badge, { flexDirection: row, backgroundColor: colors.triage[triage] }]}>
      <View style={[styles.dot, { backgroundColor: colors.onTriage[triage] }]} />
      <AppText variant="caption" weight="bold" color={colors.onTriage[triage]}>
        {t.triage[triage]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    height: 32,
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
