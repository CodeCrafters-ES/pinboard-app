import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/hooks/useSession';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui';

const ROLE_LABEL: Record<string, string> = {
  staff: 'Staff',
  manager: 'Manager',
  admin: 'Admin',
};

const ROLE_BADGE: Record<string, string> = {
  staff: 'bg-nun-parchment text-nun-muted',
  manager: 'bg-nun-sky text-nun-sea',
  admin: 'bg-nun-sky text-nun-sea',
};

export default function ProfileScreen() {
  const { session, profile } = useSession();
  const router = useRouter();

  const displayName = [profile?.name, profile?.surname].filter(Boolean).join(' ') || 'Sin nombre';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Mi perfil' }} />

      <View className="flex-1 px-5 pt-8 gap-6">
        {/* Avatar + name */}
        <View className="items-center gap-3">
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              contentFit="cover"
              className="w-20 h-20 rounded-full"
            />
          ) : (
            <View className="w-20 h-20 rounded-full bg-nun-sand items-center justify-center">
              <Text className="text-[22px] font-semibold text-nun-muted">{initials}</Text>
            </View>
          )}

          <View className="items-center gap-1">
            <Text className="text-[22px] font-bold text-nun-dark">{displayName}</Text>
            {profile?.title ? (
              <Text className="text-[15px] text-nun-muted">{profile.title}</Text>
            ) : null}
            {session?.role ? (
              <View className={`rounded-full px-2.5 py-0.5 mt-1 ${ROLE_BADGE[session.role] ?? 'bg-nun-parchment text-nun-muted'}`}>
                <Text className="text-xs font-semibold">{ROLE_LABEL[session.role]}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Actions */}
        <View className="gap-3">
          <Button
            label="Editar perfil"
            variant="secondary"
            onPress={() => router.push('/profile/edit')}
          />
          <Button
            label="Cerrar sesión"
            variant="ghost"
            className="text-nun-error"
            onPress={handleSignOut}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
