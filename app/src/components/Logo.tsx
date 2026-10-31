import { Pressable, StyleSheet, View } from 'react-native';
import { useDir, useT } from '../i18n/strings';
import { AppText } from './AppText';
import { BrandMark } from './BrandLogo';

/** The Nadjda mark from the design (red calligraphic mark with its eye). `color` forces one colour, e.g. white on red. */
export function LogoMark({ size = 26, color }: { size?: number; color?: string }) {
  return <BrandMark width={size * 1.15} color={color} />;
}

interface Props {
  compact?: boolean;
  /** Makes the logo tappable (used by the hidden triple-tap crash trigger). */
  onPress?: () => void;
}

export function Logo({ compact, onPress }: Props) {
  const t = useT();
  const { row } = useDir();
  const content = (
    <View style={[styles.row, { flexDirection: row }]}>
      <LogoMark size={compact ? 26 : 32} />
      <AppText variant={compact ? 'h2' : 'h1'} weight="extrabold">
        {t.appName}
      </AppText>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', gap: 10 } });
