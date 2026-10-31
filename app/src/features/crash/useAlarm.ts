import { useAudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

const ALARM = require('../../../assets/audio/alarm.wav');

/** Loops the alarm while `active`. Silent-switch handling is set once at startup (playsInSilentMode). */
export function useAlarm(active: boolean) {
  const player = useAudioPlayer(ALARM);

  useEffect(() => {
    if (!active) return;
    player.loop = true;
    player.volume = 1;
    player.play();
    return () => player.pause();
  }, [active, player]);
}
