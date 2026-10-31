import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { useT } from '../i18n/strings';
import { flushQueue } from '../services/queue';
import { useIncidentStore } from '../store/useIncidentStore';
import { useReportStore } from '../store/useReportStore';
import { colors } from '../theme/tokens';

/** No network and no SMS: the report is saved on the phone and retried (QueueRunner, every 15 s). */
export default function QueuedScreen() {
  const t = useT();
  const draft = useReportStore((s) => s.draft);
  const last = useIncidentStore((s) => s.last);
  const [retrying, setRetrying] = useState(false);

  // As soon as the queued report gets through, show its status
  useEffect(() => {
    if (draft && last?.short_id === draft.shortId) router.replace('/done');
  }, [draft, last]);

  if (!draft) return <Redirect href="/" />;

  const retry = async () => {
    setRetrying(true);
    await flushQueue().catch(() => []);
    setRetrying(false);
  };

  return (
    <Screen back footer={<BigButton label={t.retryNow} icon="refresh" loading={retrying} onPress={retry} />}>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.triage.YELLOW} />
        </View>
        <AppText variant="h1" weight="extrabold" center>
          {t.queuedTitle}
        </AppText>
        <AppText color={colors.textMuted} center>
          {t.queuedBody}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  icon: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.yellowSoft, alignItems: 'center', justifyContent: 'center' },
});
