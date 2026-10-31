import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { QuestionId } from '../features/triage/trees';

/**
 * One animated illustration per triage question. Modern flat-3D look (gradients, rounded limbs, soft shadows),
 * each one showing exactly the situation asked about, with a small looping motion (chest rising, blood
 * pulsing, sound waves...). Pure vectors + the built-in Animated API: works offline, any size, no assets.
 *
 * A scene is a static base plus a few `Layer`s. A layer is its own small SVG cropped to `box`
 * (x, y, w, h in the 120 x 120 drawing space), so scaling or rotating it happens around the middle of that box.
 */
const INK = '#2B3340';
const HAIR = '#2A2220';
const SHOE = '#FFFFFF';
const SHADOW = 'rgba(17,17,17,0.12)';
const MAT = '#DCD5D2';

type Box = [number, number, number, number];
type Kind =
  | 'breathe' | 'fastbreathe' | 'pulse' | 'bob' | 'rock' | 'swing' | 'swingR'
  | 'wave' | 'pop' | 'rise' | 'fall' | 'slide' | 'spin';

const DURATION: Record<Kind, number> = {
  breathe: 1800, fastbreathe: 380, pulse: 900, bob: 450, rock: 1400, swing: 700, swingR: 700,
  wave: 900, pop: 700, rise: 1600, fall: 1100, slide: 1000, spin: 3000,
};
const RESTART: Kind[] = ['rise', 'fall', 'slide', 'spin']; // run 0 -> 1 and start over; the rest go back and forth

function Gradients() {
  return (
    <Defs>
      <LinearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#F9CFAB" />
        <Stop offset="1" stopColor="#E8A57B" />
      </LinearGradient>
      <LinearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#6C9BFF" />
        <Stop offset="1" stopColor="#3A63D8" />
      </LinearGradient>
      <LinearGradient id="pants" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#4A5568" />
        <Stop offset="1" stopColor="#262D39" />
      </LinearGradient>
      <LinearGradient id="red" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FF6A5C" />
        <Stop offset="1" stopColor="#C8101E" />
      </LinearGradient>
    </Defs>
  );
}

/** A looping animated piece of the scene, cropped to `box`. */
function Layer({ s, box, kind, delay = 0, ms, children }: { s: number; box: Box; kind: Kind; delay?: number; ms?: number; children: ReactNode }) {
  const [x, y, w, h] = box;
  const k = s / 120;
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dur = ms ?? DURATION[kind];
    const run = RESTART.includes(kind)
      ? Animated.timing(v, { toValue: 1, duration: dur, easing: kind === 'spin' ? Easing.linear : Easing.out(Easing.quad), useNativeDriver: true })
      : Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]);
    const loop = Animated.loop(delay ? Animated.sequence([Animated.delay(delay), run]) : run);
    loop.start();
    return () => loop.stop();
  }, [v, kind, delay, ms]);

  const lerp = <T extends number | string>(a: T, b: T) => v.interpolate({ inputRange: [0, 1], outputRange: [a, b] as never });
  const fade = (out: number[]) => v.interpolate({ inputRange: out.length === 3 ? [0, 0.3, 1] : [0, 0.2, 0.8, 1], outputRange: out.length === 3 ? [0, 1, 0] : [0, 1, 1, 0] });
  let style: { opacity?: Animated.AnimatedInterpolation<number>; transform: object[] } = { transform: [] };
  switch (kind) {
    case 'breathe':
    case 'fastbreathe': style = { transform: [{ scale: lerp(1, 1.1) }] }; break;
    case 'pulse': style = { opacity: lerp(1, 0.82), transform: [{ scale: lerp(1, 1.1) }] }; break;
    case 'bob': style = { transform: [{ translateY: lerp(0, -3 * k) }] }; break;
    case 'rock': style = { transform: [{ rotate: lerp('-7deg', '7deg') }] }; break;
    case 'swing': style = { transform: [{ rotate: lerp('-9deg', '9deg') }] }; break;
    case 'swingR': style = { transform: [{ rotate: lerp('9deg', '-9deg') }] }; break;
    case 'wave': style = { opacity: lerp(0.25, 1), transform: [{ scale: lerp(0.85, 1.08) }] }; break;
    case 'pop': style = { transform: [{ scale: lerp(0.88, 1.12) }] }; break;
    case 'rise': style = { opacity: fade([0, 1, 0]), transform: [{ translateY: lerp(4 * k, -6 * k) }] }; break;
    case 'fall': style = { opacity: fade([0, 1, 1, 0]), transform: [{ translateY: lerp(0, 12 * k) }] }; break;
    case 'slide': style = { opacity: fade([0, 1, 1, 0]), transform: [{ translateX: lerp(-6 * k, 8 * k) }] }; break;
    case 'spin': style = { transform: [{ rotate: lerp('0deg', '360deg') }] }; break;
  }

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x * k, top: y * k, width: w * k, height: h * k }, style]}>
      <Svg width={w * k} height={h * k} viewBox={`${x} ${y} ${w} ${h}`}>
        <Gradients />
        {children}
      </Svg>
    </Animated.View>
  );
}

/** Static part of a scene: the full 120 x 120 drawing. */
function Base({ s, children }: { s: number; children: ReactNode }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120" style={{ position: 'absolute', left: 0, top: 0 }}>
      <Gradients />
      {children}
    </Svg>
  );
}

// ---- drawing pieces -------------------------------------------------------------------------------------------

const Shadow = ({ cx, cy, rx }: { cx: number; cy: number; rx: number }) => <Ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.14} fill={SHADOW} />;

/** Thick rounded stroke: arms, legs, torsos. */
const Limb = ({ d, fill, w }: { d: string; fill: 'skin' | 'shirt' | 'pants' | 'red'; w: number }) => (
  <Path d={d} stroke={`url(#${fill})`} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
);

const Shoe = ({ cx, cy, rx = 5, ry = 3 }: { cx: number; cy: number; rx?: number; ry?: number }) => <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={SHOE} stroke="#D8D2CF" strokeWidth={1} />;

type Eyes = 'open' | 'closed';
type Mouth = 'smile' | 'flat' | 'open' | 'wavy';

/** Head with hair and a simple face; `rot` turns it (a person lying down has the top of the head to the side). */
function Head({ cx, cy, r = 11, eyes = 'open', mouth = 'flat', rot = 0 }: { cx: number; cy: number; r?: number; eyes?: Eyes; mouth?: Mouth; rot?: number }) {
  // Points are given relative to the head centre, upright, and turned here (no SVG transform needed)
  const a = (rot * Math.PI) / 180;
  const p = (dx: number, dy: number) => `${(cx + dx * Math.cos(a) - dy * Math.sin(a)).toFixed(2)} ${(cy + dx * Math.sin(a) + dy * Math.cos(a)).toFixed(2)}`;
  const pt = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) });
  const ex = r * 0.38;
  const ey = r * 0.08;
  const my = r * 0.5;
  const L = pt(-ex, ey);
  const Rr = pt(ex, ey);
  const mc = pt(0, my);
  const line = { stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' } as const;
  return (
    <>
      <Circle cx={cx} cy={cy} r={r} fill="url(#skin)" />
      <Path d={`M${p(-r, -1)} Q${p(-r, -r - 3)} ${p(0, -r - 2)} Q${p(r, -r - 3)} ${p(r, -1)} Q${p(0, -r * 0.55)} ${p(-r, -1)} Z`} fill={HAIR} />
      {eyes === 'open' && (
        <>
          <Circle cx={L.x} cy={L.y} r={r * 0.11} fill={INK} />
          <Circle cx={Rr.x} cy={Rr.y} r={r * 0.11} fill={INK} />
        </>
      )}
      {eyes === 'closed' && <Path d={`M${p(-ex - 2, ey)} Q${p(-ex, ey + 2)} ${p(-ex + 2, ey)} M${p(ex - 2, ey)} Q${p(ex, ey + 2)} ${p(ex + 2, ey)}`} {...line} strokeWidth={1.4} />}
      {mouth === 'flat' && <Path d={`M${p(-3, my)} L${p(3, my)}`} {...line} />}
      {mouth === 'smile' && <Path d={`M${p(-4, my - 1)} Q${p(0, my + 3)} ${p(4, my - 1)}`} {...line} />}
      {mouth === 'open' && <Circle cx={mc.x} cy={mc.y} r={3} fill="#8A2A2A" />}
      {mouth === 'wavy' && <Path d={`M${p(-5, my)} Q${p(-2.5, my - 3)} ${p(0, my)} Q${p(2.5, my + 3)} ${p(5, my)}`} {...line} />}
    </>
  );
}

const star = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;
const DROP = (cx: number, top: number, w: number) => `M${cx} ${top} C${cx} ${top} ${cx - w} ${top + w * 1.4} ${cx - w} ${top + w * 1.9} A${w} ${w} 0 0 0 ${cx + w} ${top + w * 1.9} C${cx + w} ${top + w * 1.4} ${cx} ${top} ${cx} ${top} Z`;

// ---- scenes ---------------------------------------------------------------------------------------------------

/** Can the person walk: a figure mid-stride bobbing along, chevrons showing the direction. */
function Walk({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Shadow cx={62} cy={104} rx={30} />
      </Base>
      <Layer s={s} box={[0, 0, 120, 120]} kind="bob" ms={420}>
        <Limb d="M58 68 L44 92" fill="pants" w={10} />
        <Shoe cx={41} cy={95} />
        <Limb d="M62 68 L74 84 L78 97" fill="pants" w={10} />
        <Shoe cx={82} cy={100} />
        <Limb d="M60 46 L48 62" fill="skin" w={7} />
        <Limb d="M61 44 L60 68" fill="shirt" w={21} />
        <Limb d="M62 46 L75 58" fill="skin" w={7} />
        <Head cx={62} cy={27} r={11} mouth="smile" />
      </Layer>
      <Layer s={s} box={[84, 44, 34, 32]} kind="slide">
        <Path d="M88 52 L95 60 L88 68 M98 52 L105 60 L98 68" stroke="url(#red)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Layer>
    </>
  );
}

/** Is the person breathing: lying down, chest rising, breath leaving the mouth, lungs at the side. */
function Breathing({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Rect x={6} y={90} width={108} height={9} rx={4.5} fill={MAT} />
        <Limb d="M72 82 L102 82" fill="pants" w={14} />
        <Shoe cx={106} cy={82} rx={4} ry={6.5} />
        <Head cx={22} cy={80} r={11} eyes="closed" rot={-90} />
        <Limb d="M44 90 L60 93" fill="skin" w={6} />
      </Base>
      <Layer s={s} box={[34, 66, 44, 30]} kind="breathe">
        <Limb d="M36 82 L72 82" fill="shirt" w={19} />
      </Layer>
      <Layer s={s} box={[8, 46, 34, 24]} kind="rise" ms={1700}>
        <Circle cx={16} cy={62} r={2.6} fill="#7FB2F0" />
        <Circle cx={23} cy={57} r={3.6} fill="#7FB2F0" />
        <Circle cx={31} cy={52} r={2.2} fill="#7FB2F0" />
      </Layer>
      <Layer s={s} box={[76, 8, 40, 40]} kind="breathe">
        <Path d="M96 14 L96 28 M96 28 L90 34 M96 28 L102 34" stroke="#C8101E" strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M92 20 C86 20 80 30 80 40 C80 45 86 46 91 42 C92 38 92 28 92 20 Z" fill="url(#red)" />
        <Path d="M100 20 C106 20 112 30 112 40 C112 45 106 46 101 42 C100 38 100 28 100 20 Z" fill="url(#red)" />
      </Layer>
    </>
  );
}

/** Open the airway: a hand on the forehead tilts the head back (red arrow). */
function Airway({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Rect x={6} y={92} width={108} height={9} rx={4.5} fill={MAT} />
        <Limb d="M46 84 L82 84" fill="shirt" w={19} />
        <Limb d="M82 86 L106 86" fill="pants" w={14} />
        <Shoe cx={109} cy={86} rx={4} ry={6.5} />
      </Base>
      <Layer s={s} box={[2, 40, 50, 56]} kind="rock">
        <Limb d="M34 82 L44 84" fill="skin" w={7} />
        <Head cx={26} cy={76} r={11} eyes="closed" rot={-115} />
        <Rect x={11} y={56} width={20} height={9} rx={4.5} fill="url(#skin)" stroke="#E09E73" strokeWidth={1} />
      </Layer>
      <Layer s={s} box={[4, 20, 60, 46]} kind="pulse">
        <Path d="M54 58 Q50 34 14 40" stroke="url(#red)" strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <Path d="M20 31 L12 40 L22 47" stroke="url(#red)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Layer>
    </>
  );
}

/** Breathing very fast: upper body with a racing chest pulse, a ticking stopwatch. */
function Fast({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Shadow cx={46} cy={108} rx={34} />
        <Path d="M16 110 L18 68 Q46 54 74 68 L76 110 Z" fill="url(#shirt)" />
        <Limb d="M46 52 L46 60" fill="skin" w={10} />
        <Head cx={46} cy={37} r={14} mouth="open" />
        <Circle cx={92} cy={50} r={20} fill="#FFFFFF" stroke={INK} strokeWidth={5} />
        <Rect x={88} y={22} width={8} height={6} rx={2} fill={INK} />
        <Path d="M92 34 L92 37 M92 63 L92 66 M76 50 L79 50 M105 50 L108 50" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      </Base>
      <Layer s={s} box={[22, 66, 48, 36]} kind="fastbreathe">
        <Path d="M26 84 L34 84 L38 74 L43 96 L48 76 L52 88 L56 84 L66 84" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Layer>
      <Layer s={s} box={[72, 30, 40, 40]} kind="spin" ms={2200}>
        <Path d="M92 50 L92 36" stroke="url(#red)" strokeWidth={3.5} strokeLinecap="round" />
        <Circle cx={92} cy={50} r={3.4} fill="url(#red)" />
      </Layer>
    </>
  );
}

/** Responds when spoken to: a speaker with sound waves, a listener with a question bubble. */
function Responds({ s }: { s: number }) {
  const wave = (d: string, delay: number) => (
    <Layer key={delay} s={s} box={[44, 28, 36, 48]} kind="wave" delay={delay}>
      <Path d={d} stroke="url(#red)" strokeWidth={4} strokeLinecap="round" fill="none" />
    </Layer>
  );
  return (
    <>
      <Base s={s}>
        <Shadow cx={60} cy={110} rx={54} />
        <Path d="M6 110 L9 80 Q28 68 47 80 L50 110 Z" fill="url(#shirt)" />
        <Head cx={28} cy={54} r={14} mouth="open" />
        <Path d="M70 110 L73 82 Q92 70 111 82 L114 110 Z" fill="url(#pants)" />
        <Head cx={92} cy={56} r={14} mouth="flat" />
      </Base>
      {wave('M50 46 Q55 52 50 58', 0)}
      {wave('M56 40 Q65 52 56 64', 220)}
      {wave('M62 34 Q75 52 62 70', 440)}
      <Layer s={s} box={[76, 4, 40, 34]} kind="pop">
        <Rect x={80} y={8} width={32} height={22} rx={11} fill="#FFFFFF" stroke="#E2DBD8" strokeWidth={1.5} />
        <Path d="M92 29 L92 36 L100 29 Z" fill="#FFFFFF" />
        <SvgText x={96} y={26} fontSize={19} fontWeight="700" fill="#C8101E" textAnchor="middle">
          ?
        </SvgText>
      </Layer>
    </>
  );
}

/** Witness: a person lying by a spreading pool of blood, a drop above. */
function Bleeding({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Rect x={6} y={92} width={108} height={8} rx={4} fill={MAT} />
      </Base>
      <Layer s={s} box={[28, 84, 76, 20]} kind="pulse">
        <Ellipse cx={66} cy={93} rx={34} ry={7.5} fill="url(#red)" />
      </Layer>
      <Base s={s}>
        <Limb d="M72 82 L104 82" fill="pants" w={14} />
        <Shoe cx={108} cy={82} rx={4} ry={6.5} />
        <Head cx={20} cy={78} r={11} eyes="closed" rot={-90} />
        <Limb d="M32 82 L72 82" fill="shirt" w={19} />
        <Ellipse cx={58} cy={82} rx={7.5} ry={6.5} fill="url(#red)" />
      </Base>
      <Layer s={s} box={[38, 2, 44, 52]} kind="pulse" ms={800}>
        <Path d={DROP(60, 6, 15)} fill="url(#red)" />
        <Path d="M51 36 Q50 44 56 48" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" opacity={0.55} fill="none" />
      </Layer>
    </>
  );
}

/** Victim: own torso, a hand pressing a bleeding wound, blood running down. */
function VictimBleeding({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Shadow cx={54} cy={110} rx={34} />
        <Path d="M22 110 L25 60 Q54 46 83 60 L86 110 Z" fill="url(#shirt)" />
        <Limb d="M54 48 L54 56" fill="skin" w={11} />
        <Head cx={54} cy={33} r={14} eyes="open" mouth="wavy" />
      </Base>
      <Layer s={s} box={[44, 64, 44, 46]} kind="pulse">
        <Circle cx={66} cy={82} r={15} fill="url(#red)" />
        <Path d="M60 94 L60 106 M72 94 L73 104" stroke="#C8101E" strokeWidth={5} strokeLinecap="round" />
      </Layer>
      <Base s={s}>
        <Limb d="M84 62 L74 78" fill="skin" w={9} />
        <Rect x={52} y={74} width={30} height={17} rx={8.5} fill="url(#skin)" stroke="#E09E73" strokeWidth={1.2} />
        <Path d="M62 76 L62 89 M70 76 L70 89" stroke="#E09E73" strokeWidth={1.4} strokeLinecap="round" />
      </Base>
      <Layer s={s} box={[88, 36, 26, 46]} kind="fall">
        <Path d={DROP(100, 42, 5.5)} fill="url(#red)" />
      </Layer>
    </>
  );
}

/** Victim: can you move arms and legs. Star pose, each limb swinging from its joint. */
function VictimMove({ s }: { s: number }) {
  const arms: Box = [20, 0, 80, 80]; // centred on the shoulders (60, 40)
  const legs: Box = [20, 32, 80, 80]; // centred on the hips (60, 72)
  return (
    <>
      <Base s={s}>
        <Shadow cx={60} cy={110} rx={36} />
        <Limb d="M60 34 L60 72" fill="shirt" w={21} />
        <Head cx={60} cy={20} r={11} mouth="smile" />
      </Base>
      <Layer s={s} box={arms} kind="swing">
        <Limb d="M58 42 L28 26" fill="skin" w={7} />
        <Circle cx={26} cy={25} r={5} fill="url(#skin)" />
      </Layer>
      <Layer s={s} box={arms} kind="swingR">
        <Limb d="M62 42 L92 26" fill="skin" w={7} />
        <Circle cx={94} cy={25} r={5} fill="url(#skin)" />
      </Layer>
      <Layer s={s} box={legs} kind="swingR">
        <Limb d="M56 72 L36 100" fill="pants" w={11} />
        <Shoe cx={32} cy={104} rx={6} ry={3.4} />
      </Layer>
      <Layer s={s} box={legs} kind="swing">
        <Limb d="M64 72 L84 100" fill="pants" w={11} />
        <Shoe cx={88} cy={104} rx={6} ry={3.4} />
      </Layer>
      <Layer s={s} box={[2, 6, 22, 40]} kind="wave">
        <Path d="M16 12 Q10 24 18 38 M8 10 Q0 24 10 44" stroke="url(#red)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      </Layer>
      <Layer s={s} box={[96, 6, 22, 40]} kind="wave" delay={300}>
        <Path d="M104 12 Q110 24 102 38 M112 10 Q120 24 110 44" stroke="url(#red)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      </Layer>
    </>
  );
}

/** Victim: a blow to the head. Dazed face, a swelling bump, an impact burst and stars circling. */
function VictimHead({ s }: { s: number }) {
  return (
    <>
      <Base s={s}>
        <Shadow cx={60} cy={112} rx={34} />
        <Path d="M24 114 Q26 94 60 92 Q94 94 96 114 Z" fill="url(#shirt)" />
        <Limb d="M60 84 L60 94" fill="skin" w={15} />
        <Circle cx={32} cy={64} r={5} fill="url(#skin)" />
        <Circle cx={88} cy={64} r={5} fill="url(#skin)" />
        <Circle cx={60} cy={62} r={28} fill="url(#skin)" />
        <Path d="M32 58 Q32 30 60 32 Q88 30 88 58 Q76 44 60 46 Q44 44 32 58 Z" fill={HAIR} />
        <Circle cx={50} cy={64} r={5.4} stroke={INK} strokeWidth={1.6} fill="#FFFFFF" />
        <Circle cx={50} cy={64} r={1.8} fill={INK} />
        <Circle cx={70} cy={64} r={5.4} stroke={INK} strokeWidth={1.6} fill="#FFFFFF" />
        <Circle cx={70} cy={64} r={1.8} fill={INK} />
        <Path d="M50 79 Q55 75 60 79 T70 79" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      </Base>
      <Layer s={s} box={[62, 32, 24, 22]} kind="pulse">
        <Ellipse cx={74} cy={43} rx={10} ry={8} fill="url(#red)" />
        <Path d="M69 40 Q71 37 75 38" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={0.55} fill="none" />
      </Layer>
      <Layer s={s} box={[76, 2, 40, 40]} kind="pop">
        <Path d="M96 8 L100 19 L112 18 L103 26 L108 38 L96 31 L84 38 L89 26 L80 18 L92 19 Z" fill="#F4B400" />
      </Layer>
      <Layer s={s} box={[30, 0, 60, 60]} kind="spin" ms={3500}>
        <Path d={star(60, 6, 5)} fill="#F4B400" stroke="#FFFFFF" strokeWidth={1.2} />
        <Path d={star(84, 40, 4.5)} fill="#F4B400" stroke="#FFFFFF" strokeWidth={1.2} />
        <Path d={star(36, 40, 4.5)} fill="#F4B400" stroke="#FFFFFF" strokeWidth={1.2} />
      </Layer>
    </>
  );
}

const SCENES: Record<QuestionId, (p: { s: number }) => ReactElement> = {
  walk: Walk,
  breathing: Breathing,
  airway: Airway,
  fast: Fast,
  responds: Responds,
  bleeding: Bleeding,
  v_bleeding: VictimBleeding,
  v_move: VictimMove,
  v_head: VictimHead,
};

export function QuestionArt({ id, size }: { id: QuestionId; size: number }) {
  const Scene = SCENES[id];
  return (
    <View style={{ width: size, height: size }}>
      <Scene s={size} />
    </View>
  );
}
