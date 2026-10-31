import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

/** Dimmed page with a white sheet rising from the bottom (design: "Cet accident est peut-être déjà signalé"). */
export function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.scrim}>
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12 },
  sheet: { backgroundColor: colors.surface, borderRadius: 32, padding: 20, gap: 14, marginBottom: 8 },
});
