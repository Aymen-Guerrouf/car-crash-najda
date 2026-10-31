import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { BigButton } from '../components/BigButton';
import { LinkButton } from '../components/LinkButton';
import { Screen } from '../components/Screen';
import { useDir, useT } from '../i18n/strings';
import { fetchDispatchInfo, resolveIncident } from '../services/api';
import { useLiveStatus } from '../services/liveStatus';
import { restartTriage } from '../services/report';
import { sendScenePhoto, type ScenePhotoStatus } from '../services/scenePhoto';
import { useIncidentStore } from '../store/useIncidentStore';
import { useReportStore } from '../store/useReportStore';
import { colors, radius } from '../theme/tokens';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const clock = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour12: false });

/** Rounded-rectangle action (not a full pill) used for "Premiers Secours" / "Mettre à jour". */
function ActionButton({ label, icon, filled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; filled?: boolean; onPress: () => void }) {
  const { row } = useDir();
  const fg = filled ? colors.onDark : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, filled ? styles.actionFilled : styles.actionOutline, { flexDirection: row, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={fg} />
      <AppText variant="caption" weight="extrabold" color={fg} style={styles.actionLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Step({ label, value, done, pendingNote, last }: { label: string; value?: string; done: boolean; pendingNote?: string; last?: boolean }) {
  const { row } = useDir();
  return (
    <View style={[styles.step, { flexDirection: row }]}>
      <View style={styles.rail}>
        <View style={[styles.node, done && styles.nodeDone]}>{done && <Ionicons name="checkmark" size={12} color={colors.onDark} />}</View>
        {!last && <View style={styles.line} />}
      </View>
      <View style={styles.flex}>
        <AppText weight="extrabold" color={done ? colors.ink : colors.ink}>
          {label}
        </AppText>
        {!done && pendingNote ? (
          <AppText variant="overline" color={colors.textMuted} style={styles.sub}>
            {pendingNote}
          </AppText>
        ) : null}
      </View>
      {done && value ? (
        <AppText variant="caption" weight="semibold" color={colors.textMuted} style={styles.time}>
          {value}
        </AppText>
      ) : null}
    </View>
  );
}

/** "Suivi": alert number and triage, the timeline, the nearest hospital. Follows the dispatcher live. */
export default function StatusScreen() {
  const t = useT();
  const { row, language } = useDir();
  const last = useIncidentStore((s) => s.last);
  const live = useIncidentStore((s) => s.live);
  const liveAt = useIncidentStore((s) => s.liveAt);
  const setLive = useIncidentStore((s) => s.setLive);
  const smsConfirmed = useIncidentStore((s) => s.smsConfirmed);
  const smsConfirmedAt = useIncidentStore((s) => s.smsConfirmedAt);
  const confirmSmsDispatch = useIncidentStore((s) => s.confirmSmsDispatch);
  const draft = useReportStore((s) => s.draft);
  const mciCounts = useReportStore((s) => s.witness.mciCounts);
  // The scene photo goes on the first victim's report (a witness reports several victims, one scene)
  const sceneReportId = useReportStore((s) => s.victims[0]?.reportId ?? s.draft?.reportId ?? null);
  const [photoStatus, setPhotoStatus] = useState<ScenePhotoStatus>('idle');
  const [resolving, setResolving] = useState(false);

  const sms = last?.channel === 'SMS';
  // SMS mode: once the user confirms the ambulance SMS, the hospital is by definition chosen (the dispatcher's SMS
  // is only sent after choosing one). Fetch its name when the phone can reach the backend.
  const [smsInfo, setSmsInfo] = useState<{ hospital: { name: string; phone: string } | null; eta_min: number | null } | null>(null);
  useEffect(() => {
    if (!sms || !smsConfirmed || !last) return;
    fetchDispatchInfo(last.short_id).then(setSmsInfo).catch(() => {});
  }, [sms, smsConfirmed, last]);
  const socket = useLiveStatus(draft?.shortId ?? last?.short_id, !!last && !sms);

  if (!last) return <Redirect href="/" />;

  // The dispatcher's push wins over what the first answer said
  const hospital = live?.hospital?.name ?? smsInfo?.hospital?.name ?? last.hospital?.name ?? null;
  const hospitalPhone = live?.hospital?.phone ?? smsInfo?.hospital?.phone ?? null;
  const eta = live?.eta_min ?? smsInfo?.eta_min ?? last.hospital?.eta_min ?? null;
  const status = live?.status ?? 'NEW';
  // SMS: steps fill only when the user confirms they received the ambulance SMS
  const dispatched = sms ? smsConfirmed : (status === 'DISPATCHED' || status === 'RESOLVED');
  const resolved = status === 'RESOLVED';
  const dispatcherNote = live ? (language === 'ar' ? live.message_ar : live.message_fr) : '';
  // SMS: received/hospital confirmed only when the user gets the ambulance SMS back
  const received = sms ? smsConfirmed : !last.mock;
  const triage = last.worst_triage;
  // Re-running the questions makes no sense for the automatic alert or a counts-only mass casualty report
  const canUpdate = !sms && !resolved && !!draft && draft.role !== 'AUTO' && mciCounts === null;

  const update = () => {
    restartTriage();
    router.push('/triage');
  };

  const resolve = () =>
    Alert.alert(t.resolveConfirmTitle, t.resolveConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.resolveConfirm,
        style: 'destructive',
        onPress: async () => {
          setResolving(true);
          try {
            await resolveIncident(last.incident_id);
            // The backend also pushes this; setting it now keeps the screen instant
            setLive({ status: 'RESOLVED', hospital: live?.hospital ?? null, eta_min: eta, message_fr: '', message_ar: '' });
          } catch {
            Alert.alert(t.resolveFailed);
          } finally {
            setResolving(false);
          }
        },
      },
    ]);

  return (
    <Screen
      header="logo"
      footer={
        <>
          <View style={[styles.actions, { flexDirection: row }]}>
            <ActionButton filled label={t.firstAidShort} icon="medkit-outline" onPress={() => router.push('/first-aid')} />
            {canUpdate && <ActionButton label={t.updateShort} icon="refresh" onPress={update} />}
          </View>
          {sms && !smsConfirmed && (
            <BigButton label={t.smsConfirmDispatch} variant="danger" icon="checkmark-circle-outline" onPress={confirmSmsDispatch} />
          )}
          {!sms && !resolved && <LinkButton label={t.resolveSituation} onPress={resolve} />}
        </>
      }
    >
      <View style={[styles.titleRow, { flexDirection: row }]}>
        <AppText variant="h1" weight="extrabold" style={styles.flex}>
          {resolved ? t.resolved : sms ? t.smsSentTitle : t.doneTitle}
        </AppText>
        {!sms && socket !== 'off' && (
          <View style={[styles.livePill, { flexDirection: row }]}>
            <View style={[styles.liveDot, { backgroundColor: socket === 'open' ? colors.onlineDot : colors.triage.YELLOW }]} />
            <AppText variant="overline" weight="bold" color={colors.textMuted}>
              {socket === 'open' ? t.liveOn : t.liveReconnecting}
            </AppText>
          </View>
        )}
        {resolving && <AppText variant="caption" color={colors.textMuted}>…</AppText>}
      </View>

      {dispatcherNote !== '' && (
        <View style={styles.note}>
          <AppText variant="overline" weight="bold" color={colors.info}>
            {t.dispatcherMessage}
          </AppText>
          <AppText weight="semibold">{dispatcherNote}</AppText>
        </View>
      )}

      {sms && !smsConfirmed && (
        <View style={[styles.smsBanner, { flexDirection: row }]}>
          <Ionicons name="notifications-outline" size={18} color={colors.ink} />
          <AppText variant="caption" weight="bold" style={styles.flex}>
            {t.smsWaitingDispatch}
          </AppText>
        </View>
      )}

      <View style={[styles.alertCard, { flexDirection: row }]}>
        <View style={styles.flex}>
          <AppText variant="caption" weight="medium" color={colors.textMuted}>
            {t.alertNumber}
          </AppText>
          <AppText variant="h1" weight="extrabold" style={styles.code}>
            {last.short_id}
          </AppText>
        </View>
        <View style={[styles.triageTag, { flexDirection: row }]}>
          <View style={{ alignItems: row === 'row' ? 'flex-end' : 'flex-start' }}>
            <AppText variant="caption" weight="extrabold">
              {t.triageShort[triage] ?? triage}
            </AppText>
            <AppText variant="overline" color={colors.textMuted}>
              {t.triageUrgency[triage] ?? ''}
            </AppText>
          </View>
          {triage === 'UNKNOWN' ? (
            <View style={styles.unknownBadge}>
              <Ionicons name="help" size={16} color={colors.onDark} />
            </View>
          ) : (
            <View style={[styles.triageBadge, { backgroundColor: colors.triage[triage] }]}>
              <AppText variant="caption" weight="extrabold" color={colors.onTriage[triage]}>
                {(t.triageShort[triage] ?? triage)[0]}
              </AppText>
            </View>
          )}
        </View>
      </View>

      {!sms && !resolved && sceneReportId !== null && (
        <Pressable
          accessibilityRole="button"
          disabled={photoStatus === 'uploading'}
          onPress={() => void sendScenePhoto(sceneReportId, setPhotoStatus)}
          style={({ pressed }) => [styles.photoCard, { flexDirection: row, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={styles.photoIcon}>
            <Ionicons name={photoStatus === 'done' ? 'checkmark' : 'camera-outline'} size={22} color={colors.ink} />
          </View>
          <View style={styles.flex}>
            <AppText weight="extrabold">{t.scenePhotoTitle}</AppText>
            <AppText variant="caption" color={photoStatus === 'failed' || photoStatus === 'denied' ? colors.triage.RED : colors.textMuted}>
              {photoStatus === 'uploading'
                ? t.scenePhotoUploading
                : photoStatus === 'done'
                  ? t.scenePhotoDone
                  : photoStatus === 'failed'
                    ? t.scenePhotoFailed
                    : photoStatus === 'denied'
                      ? t.scenePhotoDenied
                      : t.scenePhotoBody}
            </AppText>
          </View>
          <AppText variant="caption" weight="extrabold">
            {photoStatus === 'done' || photoStatus === 'failed' ? t.scenePhotoRetake : photoStatus === 'uploading' ? '…' : t.scenePhotoAction}
          </AppText>
        </Pressable>
      )}

      <View style={styles.timeline}>
        <Step label={t.stepSent} value={clock(last.sentAt)} done />
        <Step label={t.stepReceived} value={received ? clock(last.sentAt + last.alertMs) : undefined} done={received} pendingNote={sms && !smsConfirmed ? t.smsWaitingDispatch : undefined} />
        <Step label={t.stepHospital} value={received ? clock(last.sentAt + last.alertMs) : undefined} done={received && (hospital !== null || sms)} />
        <Step label={t.stepAmbulance} value={dispatched ? (smsConfirmedAt ? clock(smsConfirmedAt) : (liveAt ? clock(liveAt) : undefined)) : undefined} done={dispatched} pendingNote={!dispatched ? t.stepPending : undefined} last />
      </View>

      {(smsConfirmed || !sms) && (
        <View style={[styles.hospital, { flexDirection: row }]}>
          <View style={styles.flex}>
            <AppText variant="caption" weight="medium" color={colors.textMuted}>
              {t.nearestHospital}
            </AppText>
            <AppText variant="h2" weight="extrabold">
              {hospital ?? (sms ? t.hospitalInSms : t.hospitalPending)}
            </AppText>
          </View>
          {eta != null && (
            <View style={styles.etaBox}>
              <AppText weight="extrabold" center style={styles.eta}>
                {eta}
              </AppText>
              <AppText variant="caption" weight="semibold" color={colors.textMuted} center>
                {t.minutes}
              </AppText>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!hospitalPhone}
            onPress={() => hospitalPhone && Linking.openURL(`tel:${hospitalPhone}`)}
            style={[styles.callBtn, !hospitalPhone && { opacity: 0.35 }]}
          >
            <Ionicons name="call-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>
      )}

      {last.mock && (
        <AppText variant="caption" color={colors.textFaint} center>
          {t.statusDemoTitle} · {t.statusDemoBody}
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { alignItems: 'center', gap: 12 },
  livePill: { alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, height: 28 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  note: { gap: 4, backgroundColor: colors.surface, borderRadius: radius.normal, padding: 14 },
  smsBanner: { alignItems: 'center', gap: 10, backgroundColor: colors.triage.YELLOW, borderRadius: radius.normal, paddingHorizontal: 16, height: 46 },
  alertCard: { alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.normal, paddingHorizontal: 18, paddingVertical: 16 },
  code: { fontFamily: MONO, letterSpacing: 2, fontWeight: '600' },
  triageTag: { alignItems: 'center', gap: 10 },
  triageBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  unknownBadge: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  photoCard: { alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.normal, paddingHorizontal: 16, paddingVertical: 14 },
  photoIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  timeline: { paddingHorizontal: 6, paddingVertical: 4 },
  step: { gap: 14, minHeight: 54 },
  rail: { alignItems: 'center', width: 22 },
  node: { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: colors.ink },
  line: { flex: 1, width: 2, backgroundColor: colors.surface3, marginVertical: 2 },
  sub: { marginTop: 1 },
  time: { paddingTop: 2, fontVariant: ['tabular-nums'] },
  hospital: { alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.normal, paddingHorizontal: 18, paddingVertical: 16 },
  etaBox: { alignItems: 'center' },
  eta: { fontSize: 36, lineHeight: 40 },
  callBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 12 },
  action: { flex: 1, minHeight: 58, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  actionFilled: { backgroundColor: colors.triage.RED },
  actionOutline: { borderWidth: 1.5, borderColor: colors.ink, backgroundColor: 'transparent' },
  actionLabel: { flexShrink: 1 },
});
