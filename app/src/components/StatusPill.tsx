import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import { useDir } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

/** Green "Online" / pink "Offline" pill at the top left of the emergency screens. */
export function StatusPill() {
  const net = useNetInfo();
  const { row } = useDir();
  const online = net.isConnected !== false;
  return (
    <View style={[styles.pill, { flexDirection: row, backgroundColor: online ? colors.greenSoft : colors.offlineSoft }]}>
      <View style={[styles.dot, { backgroundColor: online ? colors.onlineDot : colors.triage.RED }]} />
      <AppText variant="caption" weight="semibold" color={online ? colors.online : colors.triage.RED}>
        {online ? 'Online' : 'Offline'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
