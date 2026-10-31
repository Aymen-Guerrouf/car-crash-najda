import NetInfo from '@react-native-community/netinfo';
import { pingBackend } from './api';

/**
 * True when the backend actually answers. NetInfo's own "internet reachable" probe (it pings Google/Apple) is NOT
 * trusted: on a hotspot it can fail while the backend on the same network works. Only "no connection at all"
 * short-circuits to offline. One short attempt: an emergency must never wait on the network check.
 */
export async function checkOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  if (state.isConnected === false) return false;
  return pingBackend(2500);
}