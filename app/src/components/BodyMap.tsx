import { useWindowDimensions } from 'react-native';
import Svg, { G, Line, Polygon, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { FONT_FAMILY, colors } from '../theme/tokens';
import type { Injury, Language } from '../types';

interface Props {
  selected: Injury[];
  onToggle: (zone: Injury) => void;
  labels: Record<string, string>;
  language: Language;
}

const W = 360;
const H = 430;
const FILL = '#E5919A'; // selected fill measured on the design
const INK = colors.ink;
const RED = colors.triage.RED;

/**
 * Front-view body: tap a zone to mark where it hurts. Arms and legs both map to LIMBS (the API has one value
 * for them), so touching either lights up both labels, as in the "Choisi : Tête, Poitrine" design.
 */
export function BodyMap({ selected, onToggle, labels, language }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 380);
  const on = (z: Injury) => selected.includes(z);
  const shape = (z: Injury) => ({ fill: on(z) ? FILL : '#FFFFFF', stroke: on(z) ? RED : INK, strokeWidth: on(z) ? 3 : 3, onPress: () => onToggle(z) });
  const font = FONT_FAMILY[language];
  const label = (z: Injury, text: string, x: number, y: number, anchor: 'start' | 'end' = 'start') => (
    <SvgText
      key={text}
      x={x}
      y={y + 6}
      fontSize={19}
      textAnchor={anchor}
      fill={on(z) ? RED : INK}
      fontFamily={on(z) ? font.extrabold : font.medium}
      onPress={() => onToggle(z)}
    >
      {text}
    </SvgText>
  );
  const leader = (z: Injury, x1: number, x2: number, y: number) => <Line x1={x1} y1={y} x2={x2} y2={y} stroke={on(z) ? RED : INK} strokeWidth={1.5} />;

  return (
    <Svg width={size} height={size * (H / W)} viewBox={`0 0 ${W} ${H}`}>
      <G>
        {/* arms (touch = LIMBS) */}
        <Polygon points="122,100 144,96 152,200 128,206" {...shape('LIMBS')} />
        <Polygon points="238,96 260,100 254,206 230,200" {...shape('LIMBS')} />
        {/* legs (touch = LIMBS) */}
        <Polygon points="140,252 178,252 176,424 146,424" {...shape('LIMBS')} />
        <Polygon points="182,252 220,252 214,424 184,424" {...shape('LIMBS')} />
        {/* torso */}
        <Polygon points="140,98 220,98 216,162 144,162" {...shape('CHEST')} />
        <Rect x={146} y={164} width={68} height={46} {...shape('ABDOMEN')} />
        <Polygon points="144,212 216,212 222,250 138,250" {...shape('PELVIS')} />
        {/* neck + head */}
        <Rect x={166} y={74} width={28} height={20} rx={7} {...shape('NECK_SPINE')} />
        <Circle cx={180} cy={44} r={30} {...shape('HEAD')} />

        {/* leader lines and labels */}
        {leader('HEAD', 212, 262, 44)}
        {label('HEAD', labels.HEAD ?? 'HEAD', 268, 44)}
        {leader('NECK_SPINE', 196, 262, 84)}
        {label('NECK_SPINE', labels.NECK ?? 'NECK', 268, 84)}
        {leader('CHEST', 196, 262, 130)}
        {label('CHEST', labels.CHEST ?? 'CHEST', 268, 130)}
        {leader('ABDOMEN', 196, 262, 188)}
        {label('ABDOMEN', labels.ABDOMEN ?? 'ABDOMEN', 268, 188)}
        {leader('PELVIS', 196, 262, 232)}
        {label('PELVIS', labels.PELVIS ?? 'PELVIS', 268, 232)}
        {leader('LIMBS', 200, 262, 345)}
        {label('LIMBS', labels.LEGS ?? 'LEGS', 268, 345)}
        {leader('LIMBS', 90, 128, 156)}
        {label('LIMBS', labels.ARMS ?? 'ARMS', 84, 156, 'end')}
      </G>
    </Svg>
  );
}
