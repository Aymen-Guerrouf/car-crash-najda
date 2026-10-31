import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

/** White rounded card on the warm page background. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.big, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 18, gap: 14 },
});
