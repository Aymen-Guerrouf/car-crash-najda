import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Arch } from '../components/Arch';
import { BigButton } from '../components/BigButton';
import { Illustration } from '../components/Illustration';
import { LinkButton } from '../components/LinkButton';
import { Screen } from '../components/Screen';
import { useDir, useT } from '../i18n/strings';
import { checkOnline } from '../services/connectivity';
import { pushAll } from '../services/report';
import { sendAlertSms, type SmsOutcome } from '../services/sms';
import { useReportStore } from '../store/useReportStore';
import { colors, radius } from '../theme/tokens';

type Phase = 'checking' | 'http' | 'sms' | 'sms-failed';

/**
 * Delivers the finished report. Internet → HTTP (update of the early report), no internet → one coded SMS
 * the user sends with a single tap in Messages (iOS has no silent SMS): "Appuyez sur Envoyer".
 */
export default function SendScreen() {
  const t = useT();
  const { row } = useDir();
  const { sms: forceSms } = useLocalSearchParams<{ sms?: string }>();
  const draft = useReportStore((s) => s.draft);
  const [phase, setPhase] = useState<Phase>('checking');
  const [smsProblem, setSmsProblem] = useState<SmsOutcome | null>(null);
  const started = useRef(false);

  const trySms = useCallback(async () => {
    setPhase('sms');
    const outcome = await sendAlertSms();
    if (outcome === 'sent') {
      router.replace('/done');
    } else {
      setSmsProblem(outcome);
      setPhase('sms-failed');
    }
  }, []);

  useEffect(() => {
    if (!draft || started.current) return;
    started.current = true;
    (async () => {
      // "Pas d'internet ? Voir le mode SMS": the user asks for the SMS path explicitly
      if (!forceSms && (await checkOnline())) {
        setPhase('http');
        try {
          if ((await pushAll()) === 'sent') {
            useReportStore.getState().patchVictim(0, { updating: false });
            router.replace('/done');
            return;
          }
        } catch {
          // the backend refused it: fall through to the SMS path below
        }
        // The report is in the offline queue; SMS is the way out when the phone has a SIM
      }
      setPhase('sms');
      // Show the "tap Send" explanation for a moment, then open Messages ourselves (not when asked by hand)
      if (!forceSms) setTimeout(() => void trySms(), 1200);
    })();
  }, [draft, trySms, forceSms]);

  if (!draft) return <Redirect href="/" />;

  const problemText: Partial<Record<SmsOutcome, string>> = {
    cancelled: t.smsCancelledBody,
    unavailable: t.smsUnavailable,
    no_gateway: t.smsNoGateway,
    too_long: t.smsTooLong,
  };

  if (phase === 'checking' || phase === 'http') {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.ink} />
          <AppText variant="h1" weight="extrabold" center>
            {t.sendTitle}
          </AppText>
          <AppText color={colors.textMuted} center>
            {phase === 'http' ? t.sendingHttp : ''}
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      back
      footer={
        <BigButton label={t.smsOpen} variant="danger" icon="chatbubble-outline" onPress={trySms} />
      }
    >
      <View style={[styles.banner, { flexDirection: row }]}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.ink} />
        <AppText variant="caption" weight="bold" style={styles.flex}>
          {t.smsBanner}
        </AppText>
      </View>

      <View style={styles.art}>
        <Arch height={230}>
          <Illustration name="phone" size={150} />
        </Arch>
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.smsTapTitle} ↗
        </AppText>
        <AppText color={colors.textMuted}>{t.smsTapBody}</AppText>
        {phase === 'sms-failed' && smsProblem && (
          <AppText variant="caption" weight="semibold" color={colors.triage.RED}>
            {problemText[smsProblem]}
          </AppText>
        )}
      </View>

      <LinkButton label={t.queuedTitle} onPress={() => router.replace('/queued')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  banner: { alignItems: 'center', gap: 10, backgroundColor: colors.triage.YELLOW, borderRadius: radius.normal, paddingHorizontal: 16, height: 46 },
  art: { alignItems: 'center', marginTop: 6 },
  titleBlock: { gap: 8 },
});
