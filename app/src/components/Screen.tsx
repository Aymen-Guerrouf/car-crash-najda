import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDir, useT } from '../i18n/strings';
import { colors } from '../theme/tokens';
import { Call14Button } from './Call14Button';
import { LinkButton } from './LinkButton';
import { Logo } from './Logo';
import { StatusPill } from './StatusPill';

interface Props {
  children: ReactNode;
  /** Top row: connection pill (most screens), logo (home, status), only the Call 14 pill, or nothing. */
  header?: 'status' | 'logo' | 'call' | false;
  /** Show the "Call 14" pill in the top row. */
  call14?: boolean;
  /** Show the "my medical profile" button next to it. */
  profile?: boolean;
  /** Add the underlined "Retour" link under the footer. */
  back?: boolean;
  scroll?: boolean;
  footer?: ReactNode;
  onLogoPress?: () => void;
}

export function Screen({ children, header = 'status', call14 = true, profile = false, back, scroll = true, footer, onLogoPress }: Props) {
  const t = useT();
  const { row } = useDir();
  const Body = scroll ? ScrollView : View;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header && (
          <View style={[styles.header, { flexDirection: row }]}>
            {header === 'logo' ? <Logo compact onPress={onLogoPress} /> : header === 'status' ? <StatusPill /> : <View />}
            <View style={[styles.actions, { flexDirection: row }]}>
              {profile && (
                <Pressable accessibilityRole="button" accessibilityLabel={t.editProfile} onPress={() => router.push({ pathname: '/onboarding/profile', params: { edit: '1' } })} style={styles.profileBtn}>
                  <Ionicons name="person-outline" size={20} color={colors.ink} />
                </Pressable>
              )}
              {call14 && <Call14Button />}
            </View>
          </View>
        )}
        <Body
          style={styles.flex}
          contentContainerStyle={scroll ? styles.content : undefined}
          {...(scroll ? { keyboardShouldPersistTaps: 'handled' as const, showsVerticalScrollIndicator: false } : {})}
        >
          {children}
        </Body>
        {(footer || back) && (
          <View style={styles.footer}>
            {footer}
            {back && <LinkButton label={t.back} onPress={goBack} />}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, minHeight: 56 },
  profileBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  actions: { alignItems: 'center', gap: 8 },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  footer: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 8, gap: 8 },
});
