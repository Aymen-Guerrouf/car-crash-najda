import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/tokens';
import { BrandLogo } from './BrandLogo';

/**
 * Launch screen: the full logo eases in on the app's warm background while fonts and the saved profile load.
 * (Expo Go always shows its own native splash first; the icon and splash image in app.json apply to a real build.)
 */
export function BrandSplash() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);

  return (
    <Animated.View
      style={[styles.root, { opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
      accessibilityLabel="Nadjda"
    >
      <StatusBar style="dark" />
      <BrandLogo width={240} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
