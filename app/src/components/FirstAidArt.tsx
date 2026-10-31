import type { ReactElement } from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/tokens';

// Flat scenes (100×100) that show the action itself. Palette: ink outlines, one red accent, skin and warm grey.
const INK = colors.ink;
const RED = colors.triage.RED;
const GREEN = colors.triage.GREEN;
const SKIN = '#F2C6A0';
const GREY = '#E4DEDB';
const WHITE = '#FFFFFF';
const S = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

const Arrow = ({ x1, y1, x2, y2, color = RED }: { x1: number; y1: number; x2: number; y2: number; color?: string }) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 6;
  const p = (t: number) => `${x2 - h * Math.cos(a + t)},${y2 - h * Math.sin(a + t)}`;
  return (
    <G stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <Line x1={x1} y1={y1} x2={x2} y2={y2} />
      <Path d={`M${p(0.5)} L${x2},${y2} L${p(-0.5)}`} />
    </G>
  );
};

const Hand = ({ x, y, w, h, r = 6 }: { x: number; y: number; w: number; h: number; r?: number }) => <Rect x={x} y={y} width={w} height={h} rx={r} fill={SKIN} {...S} />;

/** A person seen from the front: head + body line, used as a small actor in several scenes. */
const Person = ({ x, y, color = INK }: { x: number; y: number; color?: string }) => (
  <G stroke={color} strokeWidth={3} strokeLinecap="round" fill="none">
    <Circle cx={x} cy={y} r={5} fill={WHITE} />
    <Path d={`M${x} ${y + 5} L${x} ${y + 22} M${x - 8} ${y + 12} L${x + 8} ${y + 12} M${x} ${y + 22} L${x - 6} ${y + 34} M${x} ${y + 22} L${x + 6} ${y + 34}`} />
  </G>
);

const Heartbeat = ({ y = 82 }: { y?: number }) => (
  <Path d={`M12 ${y} L34 ${y} L41 ${y - 12} L50 ${y + 10} L58 ${y - 6} L66 ${y} L88 ${y}`} fill="none" stroke={RED} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
);

const Clock = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <G>
    <Circle cx={cx} cy={cy} r={r} fill={WHITE} {...S} />
    <Path d={`M${cx} ${cy - r * 0.6} L${cx} ${cy} L${cx + r * 0.45} ${cy + r * 0.25}`} fill="none" stroke={RED} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </G>
);

const SCENES: Record<string, () => ReactElement> = {
  // --- not breathing ---------------------------------------------------------------------------------------------
  'not-breathing:0': () => (
    <G>
      <Rect x={33} y={10} width={34} height={64} rx={9} fill={WHITE} {...S} />
      <Rect x={45} y={15} width={10} height={3} rx={1.5} fill={INK} />
      <SvgText x={50} y={52} fontSize={26} fontWeight="bold" fill={RED} textAnchor="middle">14</SvgText>
      <Circle cx={50} cy={86} r={9} fill={GREEN} {...S} />
      <Path d="M46 84 Q50 80 54 84 L54 88 Q50 92 46 88 Z" fill={WHITE} />
      <Path d="M72 18 Q82 22 82 34 M76 14 Q90 20 90 36" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" />
    </G>
  ),
  'not-breathing:1': () => (
    <G>
      <Path d="M14 80 Q14 40 50 36 Q86 40 86 80 Z" fill={GREY} {...S} />
      <Circle cx={50} cy={50} r={10} fill="none" stroke={RED} strokeWidth={2.4} strokeDasharray="3 3" />
      <Rect x={34} y={44} width={30} height={13} rx={6.5} fill={SKIN} {...S} />
      <Rect x={38} y={38} width={24} height={12} rx={6} fill={SKIN} {...S} />
      <Circle cx={50} cy={50} r={2.8} fill={RED} />
      <Circle cx={50} cy={22} r={9} fill={SKIN} {...S} />
    </G>
  ),
  'not-breathing:2': () => (
    <G>
      <Rect x={14} y={64} width={72} height={20} rx={9} fill={GREY} {...S} />
      <Line x1={44} y1={8} x2={44} y2={44} stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <Line x1={56} y1={8} x2={56} y2={44} stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <Line x1={44} y1={8} x2={44} y2={44} stroke={SKIN} strokeWidth={5} strokeLinecap="round" />
      <Line x1={56} y1={8} x2={56} y2={44} stroke={SKIN} strokeWidth={5} strokeLinecap="round" />
      <Rect x={36} y={44} width={28} height={14} rx={7} fill={SKIN} {...S} />
      <Arrow x1={80} y1={28} x2={80} y2={56} />
      <Arrow x1={20} y1={56} x2={20} y2={28} />
      <SvgText x={50} y={96} fontSize={12} fontWeight="bold" fill={RED} textAnchor="middle">2 / s</SvgText>
    </G>
  ),
  'not-breathing:3': () => (
    <G>
      <Clock cx={50} cy={36} r={24} />
      <Heartbeat y={80} />
      <Rect x={12} y={90} width={76} height={4} rx={2} fill={GREY} />
    </G>
  ),

  // --- bleeding ------------------------------------------------------------------------------------------------
  'bleeding:0': () => (
    <G>
      <Rect x={10} y={56} width={80} height={24} rx={12} fill={SKIN} {...S} />
      <Ellipse cx={50} cy={66} rx={11} ry={6} fill={RED} />
      <Rect x={37} y={46} width={26} height={20} rx={4} fill={WHITE} {...S} />
      <Hand x={42} y={8} w={16} h={34} r={8} />
      <Arrow x1={50} y1={2} x2={50} y2={8} />
    </G>
  ),
  'bleeding:1': () => (
    <G>
      <Rect x={26} y={62} width={48} height={14} rx={3} fill={WHITE} {...S} />
      <Rect x={30} y={48} width={48} height={14} rx={3} fill={WHITE} {...S} />
      <Rect x={34} y={34} width={48} height={14} rx={3} fill={WHITE} {...S} />
      <Ellipse cx={58} cy={41} rx={8} ry={3.6} fill={RED} />
      <Circle cx={20} cy={26} r={11} fill={RED} />
      <Path d="M20 20 L20 32 M14 26 L26 26" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" />
    </G>
  ),
  'bleeding:2': () => (
    <G>
      <Rect x={8} y={60} width={70} height={22} rx={11} fill={SKIN} {...S} />
      <Rect x={30} y={50} width={24} height={18} rx={4} fill={WHITE} {...S} />
      <Ellipse cx={42} cy={58} rx={8} ry={4} fill={RED} />
      <Hand x={34} y={14} w={16} h={32} r={8} />
      <Clock cx={78} cy={26} r={15} />
    </G>
  ),

  // --- head, neck, back -----------------------------------------------------------------------------------------
  'spine:0': () => (
    <G>
      <Rect x={10} y={66} width={80} height={14} rx={7} fill={GREY} />
      <Circle cx={22} cy={58} r={9} fill={SKIN} {...S} />
      <Rect x={32} y={52} width={52} height={14} rx={7} fill={SKIN} {...S} />
      <Circle cx={74} cy={24} r={16} fill={RED} />
      <Path d="M66 24 L82 24" stroke={WHITE} strokeWidth={5} strokeLinecap="round" />
    </G>
  ),
  'spine:1': () => (
    <G>
      <Rect x={44} y={62} width={12} height={20} rx={5} fill={SKIN} {...S} />
      <Circle cx={50} cy={44} r={20} fill={SKIN} {...S} />
      <Circle cx={43} cy={42} r={2} fill={INK} />
      <Circle cx={57} cy={42} r={2} fill={INK} />
      <Path d="M44 52 Q50 56 56 52" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <Rect x={8} y={32} width={14} height={30} rx={7} fill={SKIN} {...S} />
      <Rect x={78} y={32} width={14} height={30} rx={7} fill={SKIN} {...S} />
      <Arrow x1={26} y1={47} x2={32} y2={47} />
      <Arrow x1={74} y1={47} x2={68} y2={47} />
    </G>
  ),
  'spine:2': () => (
    <G>
      <Path d="M14 20 H58 a10 10 0 0 1 10 10 v8 a10 10 0 0 1 -10 10 H34 L22 58 V48 H24 a10 10 0 0 1 -10 -10 V30 a10 10 0 0 1 0 -10 Z" fill={WHITE} {...S} />
      <Circle cx={30} cy={34} r={2.6} fill={INK} />
      <Circle cx={40} cy={34} r={2.6} fill={INK} />
      <Circle cx={50} cy={34} r={2.6} fill={INK} />
      <Rect x={40} y={58} width={46} height={26} rx={12} fill={RED} {...S} />
      <Path d="M63 77 C52 70 52 62 58 62 C61 62 63 65 63 66 C63 65 65 62 68 62 C74 62 74 70 63 77 Z" fill={WHITE} />
    </G>
  ),

  // --- does not respond ---------------------------------------------------------------------------------------
  'unresponsive:0': () => (
    <G>
      <Circle cx={34} cy={50} r={22} fill={SKIN} {...S} />
      <Path d="M54 48 L62 52 L54 56" fill={SKIN} {...S} />
      <Path d="M22 44 Q28 40 34 44" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M68 44 q8 -6 14 0 t14 0" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" />
      <Path d="M68 56 q8 -6 14 0 t14 0" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      <Path d="M24 80 H44" stroke={GREY} strokeWidth={4} strokeLinecap="round" />
    </G>
  ),
  'unresponsive:1': () => (
    <G>
      <Rect x={26} y={68} width={14} height={18} rx={5} fill={SKIN} {...S} />
      <Circle cx={33} cy={50} r={20} fill={SKIN} {...S} />
      <Path d="M74 14 L94 50 H54 Z" fill={RED} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <Rect x={72} y={26} width={4} height={14} rx={2} fill={WHITE} />
      <Circle cx={74} cy={44} r={2.4} fill={WHITE} />
    </G>
  ),
  'unresponsive:2': () => (
    <G>
      <Rect x={8} y={74} width={84} height={5} rx={2.5} fill={GREY} />
      <Circle cx={22} cy={56} r={10} fill={SKIN} {...S} />
      <Rect x={30} y={52} width={42} height={18} rx={9} fill={SKIN} {...S} />
      <Path d="M32 54 L46 40 L58 52" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M32 54 L46 40 L58 52" fill="none" stroke={SKIN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M70 56 L86 44 L88 66" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M70 56 L86 44 L88 66" fill="none" stroke={SKIN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Arrow x1={22} y1={36} x2={44} y2={36} />
    </G>
  ),

  // --- fire / smoke ----------------------------------------------------------------------------------------------
  'fire:0': () => (
    <G>
      <Path d="M18 62 L26 48 H48 L56 62 Z" fill={GREY} {...S} />
      <Rect x={10} y={60} width={54} height={16} rx={6} fill={GREY} {...S} />
      <Circle cx={24} cy={78} r={6} fill={INK} />
      <Circle cx={50} cy={78} r={6} fill={INK} />
      <Path d="M36 8 C30 22 26 28 32 38 C34 32 40 30 40 22 C48 30 52 38 44 46 C56 40 56 26 46 16 C44 22 40 20 36 8 Z" fill={RED} {...S} />
      <Arrow x1={64} y1={66} x2={88} y2={66} />
      <Person x={84} y={34} />
    </G>
  ),
  'fire:1': () => (
    <G>
      <Path d="M12 30 C8 40 6 44 10 52 C12 48 16 46 16 40 C22 46 24 52 18 58 C28 54 28 42 20 34 C18 38 16 38 12 30 Z" fill={RED} {...S} />
      <Person x={48} y={30} />
      <Arrow x1={30} y1={50} x2={22} y2={50} color={RED} />
      <Arrow x1={60} y1={52} x2={90} y2={52} />
      <Rect x={8} y={80} width={84} height={4} rx={2} fill={GREY} />
    </G>
  ),

  // --- generic reflexes ------------------------------------------------------------------------------------------
  'default:0': () => (
    <G>
      <Rect x={22} y={48} width={56} height={26} rx={9} fill={GREY} {...S} />
      <Rect x={32} y={40} width={36} height={12} rx={5} fill={GREY} {...S} />
      <Circle cx={29} cy={62} r={5} fill={RED} />
      <Circle cx={71} cy={62} r={5} fill={RED} />
      <Circle cx={29} cy={62} r={9} fill="none" stroke={RED} strokeWidth={1.8} opacity={0.5} />
      <Circle cx={71} cy={62} r={9} fill="none" stroke={RED} strokeWidth={1.8} opacity={0.5} />
      <Path d="M50 8 L64 32 H36 Z" fill={WHITE} stroke={RED} strokeWidth={4} strokeLinejoin="round" />
      <Circle cx={30} cy={78} r={6} fill={INK} />
      <Circle cx={70} cy={78} r={6} fill={INK} />
    </G>
  ),
  'default:1': () => (
    <G>
      <Rect x={8} y={26} width={84} height={20} rx={4} fill={GREY} />
      <Person x={30} y={14} />
      <Circle cx={30} cy={14} r={0} />
      <Circle cx={16} cy={20} r={9} fill={GREEN} />
      <Path d="M12 20 L15 23 L21 17" fill="none" stroke={WHITE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={8} y={58} width={84} height={26} rx={4} fill={INK} />
      <Path d="M16 71 H30 M44 71 H58 M72 71 H86" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
      <Path d="M44 60 L56 82 M56 60 L44 82" stroke={RED} strokeWidth={5} strokeLinecap="round" />
    </G>
  ),
  'default:2': () => (
    <G>
      <Path d="M50 80 C16 58 14 28 34 26 C43 25 50 32 50 38 C50 32 57 25 66 26 C86 28 84 58 50 80 Z" fill={RED} {...S} />
      <Path d="M30 50 H42 L46 42 L52 58 L56 50 H70" fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={84} cy={18} r={4} fill={RED} />
      <Circle cx={16} cy={22} r={3} fill={RED} opacity={0.6} />
    </G>
  ),
  'default:3': () => (
    <G>
      <Path d="M34 32 H66 L61 78 H39 Z" fill={WHITE} {...S} />
      <Path d="M36 46 H64" stroke={RED} strokeWidth={2.4} opacity={0.6} />
      <Path d="M58 32 L66 14" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={50} cy={52} r={34} fill="none" stroke={RED} strokeWidth={6} />
      <Line x1={26} y1={28} x2={74} y2={76} stroke={RED} strokeWidth={6} strokeLinecap="round" />
    </G>
  ),
};

/** The drawing for step `step` of first-aid set `id`; falls back to a generic scene for unknown steps. */
export function FirstAidArt({ id, step, size }: { id: string; step: number; size: number }) {
  const scene = SCENES[`${id}:${step}`] ?? SCENES[`default:${step % 4}`] ?? SCENES['default:0']!;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {scene()}
    </Svg>
  );
}
