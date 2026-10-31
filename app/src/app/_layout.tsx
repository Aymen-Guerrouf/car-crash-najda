import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { setAudioModeAsync } from 'expo-audio';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BrandSplash } from '../components/BrandSplash';
import { ILLUSTRATIONS } from '../components/Illustration';
import { QueueRunner } from '../components/QueueRunner';
import { DriveMonitor } from '../features/crash/DriveMonitor';
import { useProfileStore } from '../store/useProfileStore';
import { colors } from '../theme/tokens';

const SPLASH_MIN_MS = 1400;

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(useProfileStore.persist.hasHydrated());
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    // Icon font loaded now, not on first use: in dev it comes from Metro, which may be unreachable later (offline)
    ...Ionicons.font,
  });

  useEffect(() => {
    // Same for the illustrations: cache them while we still reach the bundler
    Asset.loadAsync(Object.values(ILLUSTRATIONS) as number[]).catch(() => {});
  }, []);

  useEffect(() => {
    // Alarm and spoken questions must play even with the iPhone silent switch on
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    // Demo mode: every launch looks like a first use (welcome, permissions, empty profile form)
    const firstUse = () => {
      if (process.env.EXPO_PUBLIC_RESET_ON_LAUNCH !== '0') useProfileStore.getState().resetForFirstUse();
    };
    const unsub = useProfileStore.persist.onFinishHydration(() => {
      firstUse();
      setHydrated(true);
    });
    if (useProfileStore.persist.hasHydrated()) {
      firstUse();
      setHydrated(true);
    }
    return unsub;
  }, []);

  // The logo stays up for at least 1.4 s, and until the persisted profile (no onboarding flash for returning
  // users) and the fonts are ready; if a font fails to load we still start, with the system font
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinShown(true), SPLASH_MIN_MS);
    return () => clearTimeout(id);
  }, []);
  if (!minShown || !hydrated || (!fontsLoaded && !fontError)) return <BrandSplash />;

  return (
    <>
      <StatusBar style="dark" />
      <DriveMonitor />
      <QueueRunner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }} />
    </>
  );
}
