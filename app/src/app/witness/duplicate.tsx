import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { BottomSheet } from '../../components/BottomSheet';
import { Call14Button } from '../../components/Call14Button';
import { StatusPill } from '../../components/StatusPill';
import { useDir, useT } from '../../i18n/strings';
import { forceNewIncident, joinIncident } from '../../services/report';
import { FONT_FAMILY, colors } from '../../theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';

const MATCH_RADIUS_M = 300; // the backend's duplicate radius (plan §8.4)

/** Small schematic map: you (black dot), the existing alert (red R) and the distance. */
function MiniMap({ triage }: { triage: string }) {
  const { language } = useDir();
  return (
    <Svg width="100%" height={150} viewBox="0 0 330 150">
      <Rect width={330} height={150} rx={22} fill="#E8E3E0" />
      <Rect x={118} y={0} width={16} height={150} fill="#FFFFFF" />
      <Line x1={0} y1={34} x2={330} y2={46} stroke="#FFFFFF" strokeWidth={16} />
      <Line x1={0} y1={112} x2={330} y2={104} stroke="#FFFFFF" strokeWidth={14} />
      <Line x1={126} y1={70} x2={226} y2={50} stroke={colors.ink} strokeWidth={1.4} strokeDasharray="4 4" />
      <Circle cx={126} cy={72} r={9} fill={colors.ink} stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={230} cy={50} r={15} fill={colors.triage.RED} stroke="#FFFFFF" strokeWidth={3} />
      <SvgText x={230} y={56} fontSize={16} fontWeight="bold" fill="#FFFFFF" textAnchor="middle" fontFamily={FONT_FAMILY[language].extrabold}>
        {triage[0] ?? 'R'}
      </SvgText>
      <Rect x={14} y={118} width={58} height={22} rx={11} fill="#FFFFFF" />
      <SvgText x={43} y={133} fontSize={12} fill={colors.ink} textAnchor="middle" fontFamily={FONT_FAMILY[language].bold}>
        {`${MATCH_RADIUS_M} m`}
      </SvgText>
    </Svg>
  );
}

/** "Cet accident est peut-être déjà signalé": another witness got there first. */
export default function DuplicateScreen() {
  const t = useT();
  const { row } = useDir();
  const { short, triage, at } = useLocalSearchParams<{ short: string; triage?: string; at?: string }>();
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(at ?? '')) / 60000));
  const ago = Number.isNaN(minutes) || minutes < 1 ? t.agoUnderMinute : t.agoMinutes(minutes);

  const add = () => {
    joinIncident(short);
    router.replace('/witness/victims');
  };
  const different = () => {
    forceNewIncident();
    router.replace('/witness/victims');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']}>
        <View style={[styles.header, { flexDirection: row }]}>
          <StatusPill />
          <Call14Button />
        </View>
      </SafeAreaView>
      <View style={StyleSheet.absoluteFill}>
        <BottomSheet>
          <MiniMap triage={triage ?? 'R'} />
          <AppText variant="h1" weight="extrabold" style={styles.title}>
            {t.dupAsk}
          </AppText>
          <AppText color={colors.textMuted}>{t.dupSub(ago, MATCH_RADIUS_M)}</AppText>
          <BigButton label={t.dupAddNew} onPress={add} />
          <Pressable accessibilityRole="button" onPress={different} style={styles.other}>
            <AppText weight="bold" center>
              {t.dupOther}
            </AppText>
          </Pressable>
        </BottomSheet>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 24, lineHeight: 30 },
  other: { paddingVertical: 10 },
});
