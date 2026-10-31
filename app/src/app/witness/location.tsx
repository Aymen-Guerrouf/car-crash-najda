import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, type MarkerDragStartEndEvent } from 'react-native-maps';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen } from '../../components/Screen';
import { crashCode } from '../../features/crash/crashSession';
import { useDir, useT } from '../../i18n/strings';
import { showFlowError } from '../../services/flows';
import { beginReport, findDuplicate, setLocation } from '../../services/report';
import { useReportStore } from '../../store/useReportStore';
import { colors, FONT_FAMILY, radius } from '../../theme/tokens';
import type { Role } from '../../types';

/** Where is the accident? GPS pin the witness can drag, plus an optional landmark ("near the exit"). */
export default function LocationScreen() {
  const t = useT();
  const { language, align, rtl } = useDir();
  const params = useLocalSearchParams<{ role?: string; short?: string; reuse?: string }>();
  const role: Role = params.role === 'BYSTANDER' ? 'BYSTANDER' : 'WITNESS';
  // A bystander continues the crash that is being handled: same incident code as the automatic alert
  const joinCode = params.short || (role === 'BYSTANDER' ? crashCode() : undefined) || undefined;
  const draft = useReportStore((s) => s.draft);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  // GPS fix + connectivity check, once. After an SOS the report already exists (same code): keep it.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const existing = useReportStore.getState().draft;
    if (params.reuse && existing) {
      setPin({ latitude: existing.lat, longitude: existing.lng });
      return;
    }
    beginReport(role, { shortId: joinCode })
      .then((d) => setPin({ latitude: d.lat, longitude: d.lng }))
      .catch((e) => {
        showFlowError(e, t);
        router.replace('/');
      });
  }, [role, joinCode, params.reuse, t]);

  const onDragEnd = (e: MarkerDragStartEndEvent) => setPin(e.nativeEvent.coordinate);

  const next = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setLocation(pin.latitude, pin.longitude, note);
    // Reusing the SOS or a bystander joining the automatic alert: no "already reported?" question
    const dup = joinCode || params.reuse ? null : await findDuplicate();
    setBusy(false);
    if (dup) {
      router.replace({ pathname: '/witness/duplicate', params: { short: dup.short_id, triage: dup.worst_triage, at: dup.created_at } });
    } else {
      router.replace('/witness/victims');
    }
  };

  return (
    <Screen back footer={<BigButton label={t.continue} disabled={!pin} loading={busy} onPress={next} />}>
      <ProgressBar value={0.28} />
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.locTitle}
        </AppText>
        <AppText color={colors.textMuted}>{pin ? t.locHint : t.locChecking}</AppText>
      </View>

      <View style={styles.mapBox}>
        {pin ? (
          <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...pin, latitudeDelta: 0.004, longitudeDelta: 0.004 }}>
            <Marker draggable coordinate={pin} onDragEnd={onDragEnd} pinColor={colors.triage.RED} />
          </MapView>
        ) : (
          <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.ink} />
        )}
      </View>

      {draft?.accuracyM != null && (
        <AppText variant="caption" color={colors.textFaint}>
          {t.locAccuracy(Math.round(draft.accuracyM))}
        </AppText>
      )}

      <View style={styles.field}>
        <AppText weight="bold">{t.locLandmark}</AppText>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={140}
          placeholder={t.locLandmarkPlaceholder}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr', fontFamily: FONT_FAMILY[language].medium }]}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 6 },
  mapBox: { height: 280, borderRadius: radius.big, overflow: 'hidden', backgroundColor: colors.surface2 },
  field: { gap: 8 },
  input: { minHeight: 56, backgroundColor: colors.surface, borderRadius: radius.normal, color: colors.ink, fontSize: 16, paddingHorizontal: 18 },
});
