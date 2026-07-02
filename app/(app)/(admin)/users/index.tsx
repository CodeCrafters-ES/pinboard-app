import { Alert, FlatList, Pressable, TextInput, View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/hooks/useSession';
import { useUserList, type Profile, type RoleFilter, type UserRole } from '@/hooks/useUserList';
import { Text } from '@/components/ui';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const ROLE_BADGE_BG: Record<UserRole, string> = {
  admin: 'bg-nun-brown',
  manager: 'bg-nun-sea',
  staff: 'bg-nun-sage',
};

const ROLE_FILTERS: { label: string; value: RoleFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Admin', value: 'admin' },
  { label: 'Manager', value: 'manager' },
  { label: 'Staff', value: 'staff' },
];

function toThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  const base = url.split('?')[0]?.replace('/object/public/', '/render/image/public/') ?? '';
  return `${base}?width=64&height=64&resize=cover`;
}

function fullName(profile: Profile): string {
  return [profile.name, profile.surname].filter(Boolean).join(' ') || '—';
}

function initials(profile: Profile): string {
  return [profile.name, profile.surname]
    .filter(Boolean)
    .map((w) => w![0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${ROLE_BADGE_BG[role]}`}>
      <Text className="text-[11px] text-white font-semibold">{ROLE_LABEL[role]}</Text>
    </View>
  );
}

function UserRow({
  profile,
  isAdmin,
  onChangeRole,
}: {
  profile: Profile;
  isAdmin: boolean;
  onChangeRole: (p: Profile) => void;
}) {
  const thumbUrl = toThumbnailUrl(profile.avatar_url);
  const name = fullName(profile);
  const ini = initials(profile);

  return (
    <View className="flex-row items-center gap-3 bg-white mx-4 my-1 rounded-xl px-3 py-3">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          contentFit="cover"
          className="w-16 h-16 rounded-full"
          accessibilityLabel={`Avatar de ${name}`}
        />
      ) : (
        <View className="w-16 h-16 rounded-full bg-nun-sand items-center justify-center">
          <Text className="text-lg font-semibold text-nun-muted">{ini}</Text>
        </View>
      )}

      <View className="flex-1 gap-1">
        <Text className="text-[15px] font-semibold text-nun-dark">{name}</Text>
        <Text className="text-xs text-nun-muted" numberOfLines={1}>{profile.email}</Text>
        <RoleBadge role={profile.role as UserRole} />
      </View>

      {isAdmin && (
        <Pressable
          onPress={() => onChangeRole(profile)}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar rol de ${name}`}
          className="px-2 py-1"
        >
          <Text className="text-xs text-nun-sea font-semibold">Cambiar rol</Text>
        </Pressable>
      )}
    </View>
  );
}

function RoleFilterBar({
  roleFilter,
  setRoleFilter,
}: {
  roleFilter: RoleFilter;
  setRoleFilter: (r: RoleFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4"
      contentContainerClassName="gap-2 py-2"
    >
      {ROLE_FILTERS.map((f) => (
        <Pressable
          key={f.value}
          onPress={() => setRoleFilter(f.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: roleFilter === f.value }}
          className={`rounded-full px-3 py-1.5 ${roleFilter === f.value ? 'bg-nun-brown' : 'bg-nun-sand'}`}
        >
          <Text
            className={`text-xs font-medium ${roleFilter === f.value ? 'text-white' : 'text-nun-dark'}`}
          >
            {f.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function UserListScreen() {
  const { session } = useSession();
  const {
    profiles,
    loading,
    error,
    inputValue,
    setInputValue,
    roleFilter,
    setRoleFilter,
    hasMore,
    loadNextPage,
    changeRole,
    refresh,
  } = useUserList();

  if (session && session.role !== 'admin' && session.role !== 'manager') {
    return <Redirect href="/(app)/(staff)/" />;
  }

  const isAdmin = session?.role === 'admin';

  function handleChangeRole(profile: Profile) {
    const name = fullName(profile);
    const roles: UserRole[] = ['admin', 'manager', 'staff'];

    Alert.alert(
      'Cambiar rol',
      name,
      [
        ...roles
          .filter((r) => r !== profile.role)
          .map((r) => ({
            text: ROLE_LABEL[r],
            onPress: async () => {
              const result = await changeRole(profile.id, r);
              if (result.error) {
                Alert.alert('Error', result.error);
              }
            },
          })),
        { text: 'Cancelar', style: 'cancel' as const },
      ],
    );
  }

  const isRefreshing = loading && profiles.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Usuarios', headerShown: true }} />

      {/* Search */}
      <View className="px-4 pt-3 pb-1">
        <TextInput
          className="bg-white border border-nun-parchment rounded-xl px-4 py-3 text-[15px] text-nun-dark"
          value={inputValue}
          onChangeText={setInputValue}
          placeholder="Buscar por nombre o email…"
          placeholderTextColor="#8C7B6A"
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Role filters */}
      <RoleFilterBar roleFilter={roleFilter} setRoleFilter={setRoleFilter} />

      {/* Error */}
      {error ? (
        <View className="mx-4 mb-2 bg-red-50 border border-nun-error rounded-xl px-4 py-3">
          <Text className="text-xs text-nun-error">{error}</Text>
        </View>
      ) : null}

      {/* List */}
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow profile={item} isAdmin={isAdmin} onChangeRole={handleChangeRole} />
        )}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.3}
        refreshing={isRefreshing}
        onRefresh={refresh}
        contentContainerClassName="pb-6 pt-1"
        ListEmptyComponent={
          !loading ? (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-nun-muted text-[15px]">No se encontraron usuarios.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && profiles.length > 0 ? (
            <ActivityIndicator className="py-4" color="#7D5A3A" />
          ) : hasMore && !loading && profiles.length > 0 ? (
            <View className="py-4 items-center">
              <Text className="text-xs text-nun-muted">Cargando más…</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
