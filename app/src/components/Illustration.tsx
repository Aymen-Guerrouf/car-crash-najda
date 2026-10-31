import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/tokens';

/**
 * The design uses 3D illustrations. Export them from Figma as PNG into `assets/illustrations/` and register them
 * in `ILLUSTRATIONS`; a PNG always wins. Until then each slot draws a flat vector stand-in with the same shapes,
 * so the layout and colours already match the design.
 */
export type IllustrationName =
  | 'paramedic' | 'warning' | 'check' | 'phone' | 'sos' | 'ambulance'
  | 'walk' | 'bleeding';

export const ILLUSTRATIONS: Partial<Record<IllustrationName, ImageSourcePropType>> = {
  paramedic: require('../../assets/illustrations/paramedic.png'),
  warning: require('../../assets/illustrations/warning.png'),
  check: require('../../assets/illustrations/check.png'),
  walk: require('../../assets/illustrations/walk.png'),
  bleeding: require('../../assets/illustrations/bleeding.png'),
  sos: require('../../assets/illustrations/sos.png'),
};

const RED = colors.triage.RED;
const INK = colors.ink;

/** Red rounded triangle with a white "!" (safety question). */
function Warning({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="wg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF5A4D" />
          <Stop offset="1" stopColor="#C8101E" />
        </LinearGradient>
      </Defs>
      <Path d="M50 10 L92 82 Q94 88 87 88 L13 88 Q6 88 8 82 Z" fill="url(#wg)" stroke="#B00A18" strokeWidth={2} strokeLinejoin="round" />
      <Path d="M50 22 L82 78 L18 78 Z" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round" opacity={0.9} />
      <Rect x={46} y={40} width={8} height={22} rx={4} fill="#FFFFFF" />
      <Circle cx={50} cy={69} r={4.6} fill="#FFFFFF" />
    </Svg>
  );
}

/** Green glossy disc with a white check ("Alerte envoyée"). */
function Check({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2FA463" />
          <Stop offset="1" stopColor="#0E6A39" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={46} fill="#E6E2E0" stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={50} cy={50} r={36} fill="url(#cg)" />
      <Path d="M32 51 L45 64 L69 38" fill="none" stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Phone with message bubbles and the dashed "tap here" ring (SMS mode). */
function Phone({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Rect x={32} y={10} width={36} height={80} rx={9} fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      <Rect x={44} y={14} width={12} height={3} rx={1.5} fill={INK} />
      <Rect x={39} y={26} width={22} height={9} rx={4.5} fill="#EAE5E3" stroke={INK} strokeWidth={2} />
      <Rect x={39} y={42} width={22} height={9} rx={4.5} fill="#EAE5E3" stroke={INK} strokeWidth={2} />
      <Rect x={39} y={70} width={20} height={9} rx={4.5} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
      <Circle cx={62} cy={74} r={9} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="3 3" />
      <Path d="M58 78 L66 70 M60 70 L66 70 L66 76" fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Cream "SOS" badge (inline in the welcome headline). */
function Sos({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={46} fill="#FBF7F2" stroke="#EAE5E3" strokeWidth={6} />
      <SvgText x={50} y={60} fontSize={30} fontWeight="bold" fill={RED} textAnchor="middle">SOS</SvgText>
    </Svg>
  );
}

/** Stick figure walking towards a red arrow (question: "Can the person walk?"). */
function Walk({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Circle cx={44} cy={24} r={8} fill="none" stroke={INK} strokeWidth={3} />
      <Path d="M44 33 L40 58 M42 40 L30 48 M42 40 L54 46 M40 58 L28 78 M40 58 L52 70 L58 76" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={22} y1={80} x2={74} y2={80} stroke="#B9B1AE" strokeWidth={3} strokeLinecap="round" />
      <Path d="M60 44 L74 44 M69 39 L74 44 L69 49" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Blood drop over a bandage (question: "Are you bleeding a lot?"). */
function Bleeding({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Path d="M50 14 C50 14 32 36 32 50 C32 60 40 68 50 68 C60 68 68 60 68 50 C68 36 50 14 50 14 Z" fill={RED} />
      <Path d="M43 46 Q41 53 46 58" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
      <Rect x={26} y={74} width={48} height={16} rx={5} fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      <Line x1={42} y1={74} x2={42} y2={90} stroke={INK} strokeWidth={2} />
      <Line x1={58} y1={74} x2={58} y2={90} stroke={INK} strokeWidth={2} />
      <Line x1={26} y1={82} x2={74} y2={82} stroke={INK} strokeWidth={2} />
    </Svg>
  );
}

const VECTOR: Partial<Record<IllustrationName, (p: { s: number }) => React.ReactElement>> = {
  warning: Warning, check: Check, phone: Phone, sos: Sos, walk: Walk, bleeding: Bleeding,
};

const ICON_FALLBACK: Record<'paramedic' | 'ambulance', keyof typeof Ionicons.glyphMap> = {
  paramedic: 'medkit',
  ambulance: 'medical',
};

export function Illustration({ name, size }: { name: IllustrationName; size: number }) {
  const source = ILLUSTRATIONS[name];
  if (source) return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
  const Vector = VECTOR[name];
  if (Vector) return <Vector s={size} />;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <Ionicons name={ICON_FALLBACK[name as 'paramedic' | 'ambulance'] ?? 'help'} size={size * 0.6} color={RED} />
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
