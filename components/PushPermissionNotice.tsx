import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useSession } from '@/hooks/useSession';

// Aviso no bloqueante: sin permisos de notificación no hay push, pero el resto de
// la app funciona igual. Solo aparece cuando el usuario los ha denegado de forma
// explícita; en emulador (`unsupported`) o ante un fallo de red (`error`) no se
// muestra, porque no hay nada que el usuario pueda hacer desde Ajustes.
export function PushPermissionNotice() {
  const { pushStatus } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (pushStatus !== 'denied' || dismissed) return null;

  return (
    <SafeAreaView edges={['top']} className="bg-nun-sand">
      <View className="px-4 py-3 flex-row items-center">
        <Text className="flex-1 mr-3 text-xs text-nun-dark">
          Notificaciones desactivadas: no recibirás avisos de nuevos posts ni eventos.
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Abrir ajustes de notificaciones"
          className="mr-4"
        >
          <Text className="text-xs font-semibold text-nun-brown">Ajustes</Text>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar aviso"
        >
          <Text className="text-xs font-semibold text-nun-muted">Cerrar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
