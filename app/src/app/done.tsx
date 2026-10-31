import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Illustration } from '../components/Illustration';
import { LinkButton } from '../components/LinkButton';
import { Screen } from '../components/Screen';
import { SPEECH_LANG } from '../features/triage/questions';
import { useDir, useT } from '../i18n/strings';
import { useIncidentStore } from '../store/useIncidentStore';
import { useProfileStore } from '../store/useProfileStore';
import { useReportStore } from '../store/useReportStore';
import { colors, radius } from '../theme/tokens';

const AUTO_FOLLOW_MS = 3000;

function CheckRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { row } = useDir();
  return (
    <View style={[styles.row, { flexDirection: row }, !last && styles.rowLine]}>
      <Ionicons name="checkmark" size={20} color={colors.triage.GREEN} />
      <AppText weight="bold" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="caption" weight="semibold" color={colors.textMuted}>
        {value}
      </AppText>
    </View>
  );
}

/** "Alerte envoyée": what went out (position, triage, medical profile), then on to the follow-up screen. */
export default function DoneScreen() {
  const t = useT();
  const { language } = useDir();
  const last = useIncidentStore((s) => s.last);
  const draft = useReportStore((s) => s.victims[0]);
  const profile = useProfileStore((s) => s.profile);

  // Felt and heard confirmation: the person may not be able to look at the screen
  useEffect(() => {
    if (!last) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Speech.speak(last.channel === 'SMS' ? t.smsSentTitle : t.doneTitle, { language: SPEECH_LANG[language] });
    return () => void Speech.stop();
  }, [last, t, language]);

  // No "next" button: the follow-up opens by itself after 3 s
  useEffect(() => {
    if (!last) return;
    const timer = setTimeout(() => router.replace('/status'), AUTO_FOLLOW_MS);
    return () => clearTimeout(timer);
  }, [last]);

  if (!last || !draft) return <Redirect href="/" />;

  const sentProfile = draft.sendProfile && (profile.blood || profile.conditions.length > 0 || profile.allergies.length > 0 || profile.name);
  const triage = last.worst_triage;

  return (
    <Screen
      footer={
        <>
          <AppText variant="caption" color={colors.textMuted} center>
            {t.doneFollowAuto}
          </AppText>
          {last.channel === 'HTTP' && <LinkButton label={t.doneNoInternet} onPress={() => router.push({ pathname: '/send', params: { sms: '1' } })} />}
        </>
      }
    >
      <View style={styles.hero}>
        <Illustration name="check" size={130} />
        <AppText variant="h1" weight="extrabold" center>
          {last.channel === 'SMS' ? t.smsSentTitle : t.doneTitle}
        </AppText>
        {last.channel === 'SMS' && (
          <AppText color={colors.textMuted} center>
            {t.smsSentBody}
          </AppText>
        )}
      </View>

      <View style={styles.card}>
        <CheckRow label={t.doneRowPosition} value={draft.accuracyM != null ? `± ${Math.round(draft.accuracyM)} m` : 'GPS'} last={!triage && !sentProfile} />
        <CheckRow label={t.doneRowTriage} value={t.triageShort[triage] ?? triage} last={!sentProfile} />
        {sentProfile ? <CheckRow label={t.doneRowProfile} value={profile.blood ?? '—'} last /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 14, marginTop: 24 },
  card: { backgroundColor: colors.surface, borderRadius: radius.big, paddingHorizontal: 18, marginTop: 8 },
  row: { alignItems: 'center', gap: 14, minHeight: 56 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
