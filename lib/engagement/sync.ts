import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { flush } from './queue';

// Vacía la cola de engagement al recuperar conectividad real. Devuelve la función
// de desuscripción; se montará en el root de la app en la issue de integración.
export function startEngagementSync(): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    if (state.isConnected && state.isInternetReachable) {
      void flush();
    }
  });
}
