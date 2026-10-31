import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import { useDir, useT } from '../i18n/strings';
import { showFlowError, startVictimFlow, startWitnessFlow } from '../services/flows';
import { colors, radius } from '../theme/tokens';

/**
 * After SOS: the alert is already on its way with the position. Is the person asking for help the one in
 * danger ("Moi"), or a witness ("Quelqu'un d'autre")?
 */
export default function RoleScreen() {
  const t = useT();
  const { row, chevron } = useDir();
  const [busy, setBusy] = useState(false);

  const me = () => {
    if (busy) return;
    setBusy(true);
    startVictimFlow(true).catch((e) => showFlowError(e, t)).finally(() => setBusy(false));
  };

  // Nothing is sent before the questions, so nobody choosing here must not mean nobody helped: after 20 s
  // the phone carries on as "me" and the questions (with their own timeout) lead to the alert
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(me, 20000); // cleared as soon as the screen loses focus (a choice was made)
      return () => clearTimeout(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const options = [
    { key: 'me', icon: 'person-outline' as const, title: t.roleMe, hint: t.roleMeHint, onPress: me },
    { key: 'other', icon: 'people-outline' as const, title: t.roleOther, hint: t.roleOtherHint, onPress: startWitnessFlow },
  ];

  return (
    <Screen header="status">
      <View style={styles.titleBlock}>
        <AppText variant="h1" weight="extrabold">
          {t.roleTitle}
        </AppText>
        <AppText color={colors.textMuted}>{t.roleSub}</AppText>
      </View>

      <View style={styles.list}>
        {options.map((o) => (
          <Pressable key={o.key} accessibilityRole="button" disabled={busy} onPress={o.onPress} style={({ pressed }) => [styles.card, { flexDirection: row, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}>
            <View style={styles.icon}>
              <Ionicons name={o.icon} size={30} color={colors.ink} />
            </View>
            <View style={styles.flex}>
              <AppText variant="h2" weight="extrabold">
                {o.title}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {o.hint}
              </AppText>
            </View>
            <Ionicons name={chevron} size={22} color={colors.textFaint} />
          </Pressable>
        ))}
      </View>

      <AppText variant="caption" color={colors.textMuted} center>
        {t.roleReassure}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  titleBlock: { gap: 8, marginTop: 8 },
  list: { gap: 14, marginTop: 8 },
  card: { minHeight: 112, padding: 20, gap: 16, borderRadius: radius.big, backgroundColor: colors.surface, alignItems: 'center' },
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
