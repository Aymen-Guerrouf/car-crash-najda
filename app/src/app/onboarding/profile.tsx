import { Ionicons } from '@expo/vector-icons';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { Chip } from '../../components/Chip';
import { LinkButton } from '../../components/LinkButton';
import { Screen } from '../../components/Screen';
import { LANGUAGE_LABELS, useDir, useT } from '../../i18n/strings';
import { requestLocationPermission } from '../../services/location';
import { pickProfilePhoto, uploadPhoto, type PhotoStatus } from '../../services/photo';
import { useProfileStore } from '../../store/useProfileStore';
import { colors, FONT_FAMILY, radius } from '../../theme/tokens';
import { ALLERGY_CODES, BLOOD_TYPES, CONDITION_CODES } from '../../types';

const CONDITION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  DIA: 'water-outline', HTA: 'pulse-outline', CAR: 'heart-outline', AST: 'options-outline', EPI: 'flash-outline', ANT: 'medical-outline', PRG: 'person-outline', OTH: 'create-outline',
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText weight="bold">{label}</AppText>
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const t = useT();
  const { row, align, rtl, language } = useDir();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === '1';
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);
  const finishOnboarding = useProfileStore((s) => s.finishOnboarding);
  const setLanguage = useProfileStore((s) => s.setLanguage);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>('idle');

  // Edits are saved as you type; the buttons only leave the screen
  const done = () => {
    if (isEdit) return router.back();
    // Asked once, here, so an emergency never meets a permission dialog (the camera is only for the torch flash)
    void requestLocationPermission()
      .then(() => Camera.requestCameraPermissionsAsync().catch(() => {}))
      .then(() => requestRecordingPermissionsAsync().catch(() => {})); // microphone: voice yes/no when hands are busy
    finishOnboarding();
    router.replace('/');
  };

  const choosePhoto = async () => {
    const picked = await pickProfilePhoto();
    if (picked === 'denied') return setPhotoStatus('denied');
    if (!picked) return;
    // Show it right away; the hosted URL (the only thing sent in alerts) arrives after the upload
    setProfile({ photoUri: picked, photoUrl: null });
    setPhotoStatus('uploading');
    const res = await uploadPhoto(picked);
    if ('url' in res) {
      setProfile({ photoUrl: res.url });
      setPhotoStatus('saved');
    } else {
      setPhotoStatus(res.status);
    }
  };
  const photoSource = profile.photoUrl ?? profile.photoUri;
  const photoMessage: Partial<Record<PhotoStatus, string>> = {
    uploading: t.photoUploading,
    saved: t.photoSaved,
    local: t.photoLocalOnly,
    failed: t.photoFailed,
    denied: t.photoDenied,
  };

  // Free text (name, other condition/allergy) may be typed in Arabic or French whatever the app language: system font, automatic direction
  const freeTextStyle = [styles.input, { textAlign: 'auto' as const, writingDirection: 'auto' as const }];
  const inputStyle = [styles.input, { textAlign: align, writingDirection: rtl ? ('rtl' as const) : ('ltr' as const), fontFamily: FONT_FAMILY[language].medium }];

  return (
    <Screen
      header="call"
      footer={
        <>
          <BigButton label={isEdit ? t.save : t.continue} onPress={done} />
          {!isEdit && <LinkButton label={t.skipLink} onPress={done} />}
        </>
      }
    >
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.profileAsk}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t.profileAskSub}
        </AppText>
      </View>

      {isEdit && (
        <Field label={t.languageLabel}>
          <View style={[styles.wrap, { flexDirection: row }]}>
            {(['ar', 'fr'] as const).map((code) => (
              <Chip key={code} label={LANGUAGE_LABELS[code]} selected={language === code} onPress={() => setLanguage(code)} />
            ))}
          </View>
        </Field>
      )}

      <View style={[styles.photoRow, { flexDirection: row }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.addPhoto} onPress={choosePhoto} style={styles.avatar}>
          {photoSource ? <Image source={{ uri: photoSource }} style={styles.avatarImg} /> : <Ionicons name="camera-outline" size={26} color={colors.textMuted} />}
          {photoStatus === 'uploading' && (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color={colors.onDark} />
            </View>
          )}
        </Pressable>
        <View style={styles.flex}>
          <Pressable accessibilityRole="button" onPress={choosePhoto} hitSlop={8}>
            <AppText weight="bold" underline>
              {photoSource ? t.changePhoto : t.addPhoto}
            </AppText>
          </Pressable>
          {photoMessage[photoStatus] && (
            <AppText variant="caption" color={photoStatus === 'saved' ? colors.triage.GREEN : colors.textMuted}>
              {photoMessage[photoStatus]}
            </AppText>
          )}
        </View>
      </View>

      <View style={[styles.nameAge, { flexDirection: row }]}>
        <View style={styles.nameCol}>
          <Field label={t.name}>
            <TextInput style={freeTextStyle} value={profile.name} onChangeText={(name) => setProfile({ name })} autoCapitalize="words" placeholder={t.name} placeholderTextColor={colors.textFaint} />
          </Field>
        </View>
        <View style={styles.ageCol}>
          <Field label={t.age}>
            <TextInput
              style={inputStyle}
              keyboardType="number-pad"
              maxLength={3}
              value={profile.age != null ? String(profile.age) : ''}
              onChangeText={(v) => setProfile({ age: v ? parseInt(v, 10) || null : null })}
              placeholder={t.age}
              placeholderTextColor={colors.textFaint}
            />
          </Field>
        </View>
      </View>
      <Field label={t.sex}>
        <View style={[styles.wrap, { flexDirection: row }]}>
          <Chip label={t.male} selected={profile.sex === 'M'} onPress={() => setProfile({ sex: profile.sex === 'M' ? null : 'M' })} />
          <Chip label={t.female} selected={profile.sex === 'F'} onPress={() => setProfile({ sex: profile.sex === 'F' ? null : 'F' })} />
        </View>
      </Field>

      <Field label={t.sectionBlood}>
        <View style={[styles.wrap, { flexDirection: row }]}>
          {BLOOD_TYPES.map((b) => (
            <Chip key={b} label={b} selected={profile.blood === b} onPress={() => setProfile({ blood: profile.blood === b ? null : b })} />
          ))}
          <Chip label={t.bloodUnknown} selected={profile.blood === null} onPress={() => setProfile({ blood: null })} />
        </View>
      </Field>

      <Field label={t.conditions}>
        <View style={[styles.wrap, { flexDirection: row }]}>
          {CONDITION_CODES.map((c) => (
            <Chip key={c} icon={CONDITION_ICONS[c]} label={t.conditionLabels[c]} selected={profile.conditions.includes(c)} onPress={() => setProfile({ conditions: toggle(profile.conditions, c) })} />
          ))}
        </View>
        {profile.conditions.includes('OTH') && (
          <TextInput style={freeTextStyle} value={profile.conditionOther} onChangeText={(conditionOther) => setProfile({ conditionOther })} maxLength={60} placeholder={t.conditionOtherHint} placeholderTextColor={colors.textFaint} />
        )}
      </Field>

      <Field label={t.allergies}>
        <View style={[styles.wrap, { flexDirection: row }]}>
          {ALLERGY_CODES.map((a) => (
            <Chip key={a} label={t.allergyLabels[a]} selected={profile.allergies.includes(a)} onPress={() => setProfile({ allergies: toggle(profile.allergies, a) })} />
          ))}
        </View>
        {profile.allergies.includes('OTH') && (
          <TextInput style={freeTextStyle} value={profile.allergyOther} onChangeText={(allergyOther) => setProfile({ allergyOther })} maxLength={60} placeholder={t.allergyOtherHint} placeholderTextColor={colors.textFaint} />
        )}
      </Field>

      <Field label={t.sectionContact}>
        <TextInput style={inputStyle} value={profile.contactName} onChangeText={(contactName) => setProfile({ contactName })} placeholder={t.contactName} placeholderTextColor={colors.textFaint} />
        <TextInput
          style={[inputStyle, { textAlign: 'left', writingDirection: 'ltr' as const }]}
          keyboardType="phone-pad"
          value={profile.contact}
          onChangeText={(contact) => setProfile({ contact })}
          placeholder={`${t.contact} · +213 5XX XX XX XX`}
          placeholderTextColor={colors.textFaint}
        />
      </Field>
      <View style={[styles.note, { flexDirection: row }]}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
          {t.profileSavedNote}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleBlock: { gap: 6 },
  photoRow: { alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 64, height: 64 },
  avatarBusy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  field: { gap: 10 },
  nameAge: { gap: 12 },
  nameCol: { flex: 2.1 },
  ageCol: { flex: 1 },
  wrap: { flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 56, backgroundColor: colors.surface, borderRadius: radius.normal, color: colors.ink, fontSize: 16, paddingHorizontal: 18, marginBottom: 2 },
  note: { alignItems: 'center', gap: 8, paddingVertical: 4 },
});
