import { View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import { THRESHOLDS } from './detector';

interface Props {
  samples: number[];
  width: number;
  height: number;
  /** Vertical range in g. The detector fires around 4 g, so 0–6 g keeps the spike visible. */
  maxG?: number;
}

/** Live accelerometer magnitude with the free-fall (0,4 g) and impact (2,5 g) thresholds: what the jury watches. */
export function SensorSparkline({ samples, width, height, maxG = 6 }: Props) {
  const y = (g: number) => height - (Math.min(g, maxG) / maxG) * height;
  const points = samples.map((g, i) => `${(i / Math.max(samples.length - 1, 1)) * width},${y(g)}`).join(' ');
  const spiking = samples.some((g) => g > THRESHOLDS.impactAfterFallG);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={y(1)} y2={y(1)} stroke={colors.border} strokeWidth={1} />
        <Line x1={0} x2={width} y1={y(THRESHOLDS.impactAfterFallG)} y2={y(THRESHOLDS.impactAfterFallG)} stroke={colors.triage.RED} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
        <Line x1={0} x2={width} y1={y(THRESHOLDS.freefallG)} y2={y(THRESHOLDS.freefallG)} stroke={colors.triage.YELLOW} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
        {samples.length > 1 && (
          <Polyline points={points} fill="none" stroke={spiking ? colors.triage.RED : colors.ink} strokeWidth={2} strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
}
