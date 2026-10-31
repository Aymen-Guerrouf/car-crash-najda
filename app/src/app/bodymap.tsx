import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { BigButton } from '../components/BigButton';
import { BodyMap } from '../components/BodyMap';
import { LinkButton } from '../components/LinkButton';
import { Screen } from '../components/Screen';
import { useDir, useT } from '../i18n/strings';
import { setBodyPain } from '../services/report';
import { useReportStore } from '../store/useReportStore';
import { colors } from '../theme/tokens';
import type { Injury } from '../types';

const ZONE_ORDER: { injury: Injury; key: string }[] = [
  { injury: 'HEAD', key: 'HEAD' },
  { injury: 'NECK_SPINE', key: 'NECK' },
  { injury: 'CHEST', key: 'CHEST' },
  { injury: 'ABDOMEN', key: 'ABDOMEN' },
  { injury: 'PELVIS', key: 'PELVIS' },
  { injury: 'LIMBS', key: 'LIMBS' },
];

/** Victim self-report of where it hurts: tap the silhouette, "Choisi : Tête, Poitrine". */
export default function BodyMapScreen() {
  const t = useT();
  const { language } = useDir();
  const draft = useReportStore((s) => s.draft);
  const [selected, setSelected] = useState<Injury[]>(draft?.bodyPain ?? []);

  if (!draft) return <Redirect href="/" />;

  const toggle = (z: Injury) => setSelected((s) => (s.includes(z) ? s.filter((x) => x !== z) : [...s, z]));
  // The report is finished here: the send screen delivers it (HTTP update or one SMS)
  const finish = (zones: Injury[]) => {
    setBodyPain(zones);
    router.replace('/send');
  };

  const chosen = ZONE_ORDER.filter((z) => selected.includes(z.injury))
    .map((z) => (z.injury === 'LIMBS' ? `${t.zoneNames.ARMS}, ${t.zoneNames.LEGS}` : t.zoneNames[z.key]))
    .join(', ');

  return (
    <Screen
      back
      footer={<BigButton label={t.doneLabel} onPress={() => finish(selected)} />}
    >
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.bodyAsk}
        </AppText>
        <AppText color={colors.textMuted}>{t.bodyAskSub}</AppText>
      </View>

      <View style={styles.map}>
        <BodyMap selected={selected} onToggle={toggle} labels={t.zoneNames} language={language} />
      </View>

      <AppText variant="caption" weight="semibold" color={colors.textMuted} center>
        {selected.length > 0 ? t.bodyChosen(chosen) : t.bodyNone}
      </AppText>

      <LinkButton label={t.skipLink} blue onPress={() => finish([])} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 6 },
  map: { alignItems: 'center' },
});
