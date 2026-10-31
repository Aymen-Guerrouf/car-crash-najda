import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { useT } from '../../i18n/strings';
import { setVictimTotal } from '../../services/report';
import { useReportStore, type Counts } from '../../store/useReportStore';
import { colors } from '../../theme/tokens';

const MCI_THRESHOLD = 5;

/** How many injured? Up to 4: one short triage each. 5 or more is a mass casualty: counts per state only. */
export default function VictimsScreen() {
  const t = useT();
  const draft = useReportStore((s) => s.draft);
  const [total, setTotal] = useState(1);
  const [counts, setCounts] = useState<Counts>({ RED: 0, YELLOW: 0, GREEN: 0 });
  const [mci, setMci] = useState(false);

  if (!draft) return <Redirect href="/" />;

  const sum = counts.RED + counts.YELLOW + counts.GREEN;
  const canContinue = mci ? sum >= MCI_THRESHOLD : true;

  const next = () => {
    if (mci) {
      setVictimTotal(sum, counts);
      router.replace('/witness/hazards');
    } else {
      setVictimTotal(total);
      router.replace('/triage');
    }
  };

  const rows: { key: keyof Counts; label: string; color: string }[] = [
    { key: 'RED', label: t.mciRed, color: colors.triage.RED },
    { key: 'YELLOW', label: t.mciYellow, color: colors.triage.YELLOW },
    { key: 'GREEN', label: t.mciGreen, color: colors.triage.GREEN },
  ];

  return (
    <Screen back footer={<BigButton label={t.continue} disabled={!canContinue} onPress={next} />}>
      <ProgressBar value={0.42} />
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {mci ? t.mciTitle : t.victimsAsk}
        </AppText>
        <AppText color={colors.textMuted}>{mci ? t.mciHint : t.victimsAskSub}</AppText>
      </View>

      {mci ? (
        <Card>
          {rows.map((r) => (
            <View key={r.key} style={styles.mciRow}>
              <View style={[styles.dot, { backgroundColor: r.color }]} />
              <AppText style={styles.flex} weight="semibold">
                {r.label}
              </AppText>
              <Stepper value={counts[r.key]} onChange={(v) => setCounts((c) => ({ ...c, [r.key]: v }))} max={99} />
            </View>
          ))}
        </Card>
      ) : (
        <View style={styles.center}>
          <Stepper large value={total} min={1} max={9} onChange={setTotal} />
          <Chip
            label={t.victimsFivePlus}
            selected={false}
            onPress={() => {
              setMci(true);
              setCounts({ RED: 0, YELLOW: 0, GREEN: 0 });
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleBlock: { gap: 6 },
  center: { alignItems: 'center', gap: 28, marginTop: 56 },
  mciRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
