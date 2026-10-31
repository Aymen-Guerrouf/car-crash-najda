import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { ChoiceTile } from '../../components/ChoiceTile';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen } from '../../components/Screen';
import { useDir, useT } from '../../i18n/strings';
import { finalizeWitness } from '../../services/report';
import { useReportStore } from '../../store/useReportStore';
import { colors } from '../../theme/tokens';
import type { Flag } from '../../types';

const HAZARDS: { flag: Flag; icon: keyof typeof Ionicons.glyphMap }[] = [
  { flag: 'FIRE', icon: 'flame-outline' },
  { flag: 'SMOKE', icon: 'cloud-outline' },
  { flag: 'FUEL_LEAK', icon: 'water-outline' },
  { flag: 'TRAPPED', icon: 'body-outline' },
  { flag: 'ROAD_BLOCKED', icon: 'remove-circle-outline' },
];

/** "Voyez-vous un danger ?" What else is dangerous at the scene? Ends the witness questions. */
export default function HazardsScreen() {
  const t = useT();
  const { row } = useDir();
  const draft = useReportStore((s) => s.victims[0]);
  const [selected, setSelected] = useState<Flag[]>(draft?.hazards ?? []);

  if (!draft) return <Redirect href="/" />;

  const toggle = (f: Flag) => setSelected((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));
  const finish = () => {
    finalizeWitness(selected);
    router.replace('/send');
  };

  return (
    <Screen back footer={<BigButton label={t.continue} onPress={finish} />}>
      <ProgressBar value={0.85} />
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.hazardsAsk}
        </AppText>
        <AppText color={colors.textMuted}>{t.hazardsAskSub}</AppText>
      </View>

      <View style={[styles.grid, { flexDirection: row }]}>
        {HAZARDS.map(({ flag, icon }) => (
          <ChoiceTile key={flag} label={t.hazards[flag]} icon={icon} selected={selected.includes(flag)} onPress={() => toggle(flag)} />
        ))}
        <ChoiceTile neutral label={t.hazardNone} icon="ban-outline" selected={selected.length === 0} onPress={() => setSelected([])} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 6 },
  grid: { flexWrap: 'wrap', gap: 12 },
});
