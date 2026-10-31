import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnswerTile } from '../../components/AnswerTile';
import { AppText } from '../../components/AppText';
import { Arch } from '../../components/Arch';
import { BigButton } from '../../components/BigButton';
import { Card } from '../../components/Card';
import { Illustration } from '../../components/Illustration';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen } from '../../components/Screen';
import { SPEECH_LANG } from '../../features/triage/questions';
import { useDir, useT } from '../../i18n/strings';
import { colors } from '../../theme/tokens';

/** First thing a witness is asked: are YOU safe? Helping from the road kills helpers. */
export default function SafetyScreen() {
  const t = useT();
  const { language, row } = useDir();
  const params = useLocalSearchParams<{ role?: string; short?: string; reuse?: string }>();
  const [safe, setSafe] = useState<boolean | null>(null);

  useEffect(() => {
    Speech.speak(t.safetyAsk, { language: SPEECH_LANG[language], rate: 0.95 });
    return () => void Speech.stop();
  }, [t, language]);

  const next = () => {
    Speech.stop();
    router.replace({ pathname: '/witness/location', params: { role: params.role ?? 'WITNESS', short: params.short ?? '', reuse: params.reuse ?? '' } });
  };

  return (
    <Screen back>
      <ProgressBar value={0.14} />

      <View style={styles.art}>
        <Arch>
          <Illustration name="warning" size={150} />
        </Arch>
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold" center>
          {safe === false ? t.safetyWarnTitle : t.safetyAsk}
        </AppText>
        {safe !== false && (
          <AppText color={colors.textMuted} center>
            {t.safetyAskSub}
          </AppText>
        )}
      </View>

      {safe === false ? (
        <>
          <Card>
            {t.safetySteps.map((step, i) => (
              <View key={i} style={[styles.step, { flexDirection: row }]}>
                <Ionicons name="warning" size={20} color={colors.triage.YELLOW} />
                <AppText style={styles.flex}>{step}</AppText>
              </View>
            ))}
          </Card>
          <BigButton label={t.safetyNowSafe} onPress={next} />
        </>
      ) : (
        <View style={[styles.yesNo, { flexDirection: row }]}>
          <AnswerTile kind="yes" label={t.yes} onPress={next} />
          <AnswerTile kind="no" label={t.no} onPress={() => setSafe(false)} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  art: { alignItems: 'center', marginTop: 4 },
  titleBlock: { gap: 8, alignItems: 'center' },
  step: { alignItems: 'flex-start', gap: 12 },
  yesNo: { gap: 12, marginTop: 8 },
});
