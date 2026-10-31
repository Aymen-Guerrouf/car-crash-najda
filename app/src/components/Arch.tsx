import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

/** Arch-shaped panel with a white outline that frames an illustration (design: safety, SMS, welcome). */
export function Arch({ children, width = 190, height = 210 }: { children: ReactNode; width?: number; height?: number }) {
  return (
    <View style={[styles.outer, { width, height, borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2 }]}>
      <View style={[styles.inner, { borderTopLeftRadius: width / 2 - 5, borderTopRightRadius: width / 2 - 5 }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignSelf: 'center', backgroundColor: colors.surface, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 5 },
  inner: { flex: 1, backgroundColor: colors.surface2, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
