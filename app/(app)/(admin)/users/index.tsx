import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { listProfiles, updateUserRole } from '@/lib/supabase/queries/profiles';
import type { UserRole } from '@/lib/database.types';
import type { Database } from '@/lib/database.types';
import { Button } from '@/components/ui';

type Profile = Database['public']['Tables']['profiles']['Row'];

const PAGE_SIZE = 25;

const ROLE_LABEL: Record<UserRole, string> = {
  staff: 'Staff',
  manager: 'Manager',
  admin: 'Admin',
};

const ROLE_BADGE: Record<UserRole, string> = {
  staff: 'bg-nun-parchment',
  manager: 'bg-nun-sky',
  admin: 'bg-nun-sky',
};

const ROLE_TEXT: Record<UserRole, string> = {
  staff: 'text-nun-muted',
  manager: 'text-nun-sea',
  admin: 'text-nun-sea',
};

const ROLE_FILTERS: Array<{ label: string; value: UserRole | null }> = [
  { label: 'Todos', value: null },
  { label: 'Admin', value: 'admin' },
  { label: 'Manager', value: 'manager' },
  { label: 'Staff', value: 'staff' },
];

function avatarUri(url: string) {
  return `${url}?width=64&height=64&resize=cover`;
}

function UserRow({
  item,
  isAdmin,
  onChangeRole,
}: {
  item: Profile;
  isAdmin: boolean;
  onChangeRole: (profile: Profile) => void;
}) {
  const displayName = [item.name, item.surname].filter(Boolean).join(' ') || item.email;
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View className="flex-row items-center gap-3 bg-white rounded-xl px-4 py-3 mb-2">
      {item.avatar_url ? (
        <Image
          source={{ uri: avatarUri(item.avatar_url) }}
          contentFit="cover"
          className="w-12 h-12 rounded-full"
        />
      ) : (
        <View className="w-12 h-12 rounded-full bg-nun-sand items-center justify-center">
          <Text className="text-[15px] font-semibold text-nun-muted">{initials}</Text>
        </View>
      )}

      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold text-nun-dark" numberOfLines={1}>
          {displayName}
        </Text>
        <Text className="text-[13px] text-nun-muted" numberOfLines={1}>
          {item.email}
        </Text>
        <View
          className={`self-start rounded-full px-2 py-0.5 mt-0.5 ${ROLE_BADGE[item.role as UserRole] ?? 'bg-nun-parchment'}`}
        >
          <Text
            className={`text-[11px] font-semibold ${ROLE_TEXT[item.role as UserRole] ?? 'text-nun-muted'}`}
          >
            {ROLE_LABEL[item.role as UserRole] ?? item.role}
          </Text>
        </View>
      </View>

      {isAdmin ? (
        <Pressable
          onPress={() => onChangeRole(item)}
          className="bg-nun-sand border border-nun-parchment rounded-lg px-3 py-1.5 active:opacity-70"
          accessibilityLabel={`Cambiar rol de ${displayName}`}
        >
          <Text className="text-[13px] font-medium text-nun-dark">Rol</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  onInvite: (email: string, role: UserRole) => Promise<void>;
}

function InviteModal({ visible, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [isLoading, setIsLoading] = useState(false);

  function reset() {
    setEmail('');
    setRole('staff');
    setIsLoading(false);
  }

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Email inválido', 'Introduce un email válido.');
      return;
    }
    setIsLoading(true);
    try {
      await onInvite(trimmed, role);
      reset();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo enviar la invitación.';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50 justify-center px-5"
        onPress={onClose}
        accessibilityLabel="Cerrar modal"
      >
        <Pressable
          className="bg-nun-linen rounded-2xl p-5 gap-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-[18px] font-bold text-nun-dark">Invitar usuario</Text>

          <View className="gap-1.5">
            <Text className="text-[13px] font-medium text-nun-dark">Email</Text>
            <TextInput
              className="bg-white border border-nun-parchment rounded-xl px-4 py-3 text-[15px] text-nun-dark"
              value={email}
              onChangeText={setEmail}
              placeholder="nombre@ejemplo.com"
              placeholderTextColor="#8C7B6A"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-[13px] font-medium text-nun-dark">Rol inicial</Text>
            <View className="flex-row gap-2">
              {(['staff', 'manager', 'admin'] as UserRole[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  className={`flex-1 py-2 rounded-xl items-center border ${
                    role === r
                      ? 'bg-nun-brown border-nun-brown'
                      : 'bg-white border-nun-parchment'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-semibold ${role === r ? 'text-white' : 'text-nun-dark'}`}
                  >
                    {ROLE_LABEL[r]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3 mt-1">
            <Button
              label="Cancelar"
              variant="secondary"
              onPress={onClose}
              className="flex-1"
            />
            <Button
              label={isLoading ? 'Enviando…' : 'Invitar'}
              variant="primary"
              onPress={handleSubmit}
              disabled={isLoading}
              className="flex-1"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function UsersScreen() {
  const { session } = useSession();
  const isAdmin = session?.role === 'admin';

  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSearch = useRef('');

  const load = useCallback(async (opts: { search: string; role: UserRole | null; page: number; append: boolean }) => {
    const isFirst = !opts.append;
    isFirst ? setIsLoading(true) : setIsLoadingMore(true);
    setError(null);
    try {
      const result = await listProfiles({
        search: opts.search || undefined,
        role: opts.role,
        page: opts.page,
        pageSize: PAGE_SIZE,
      });
      setTotal(result.total);
      setRows((prev) => (opts.append ? [...prev, ...result.rows] : result.rows));
      setPage(opts.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios.');
    } finally {
      isFirst ? setIsLoading(false) : setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load({ search, role: roleFilter, page: 0, append: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  function handleSearchChange(text: string) {
    setSearch(text);
    pendingSearch.current = text;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      load({ search: pendingSearch.current, role: roleFilter, page: 0, append: false });
    }, 400);
  }

  function handleLoadMore() {
    if (rows.length >= total || isLoadingMore) return;
    load({ search, role: roleFilter, page: page + 1, append: true });
  }

  function handleChangeRole(profile: Profile) {
    const options = (['admin', 'manager', 'staff'] as UserRole[]).filter(
      (r) => r !== profile.role
    );
    Alert.alert(
      'Cambiar rol',
      `Usuario: ${[profile.name, profile.surname].filter(Boolean).join(' ') || profile.email}\nRol actual: ${ROLE_LABEL[profile.role as UserRole]}`,
      [
        ...options.map((r) => ({
          text: `→ ${ROLE_LABEL[r]}`,
          onPress: () => confirmRoleChange(profile, r),
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]
    );
  }

  async function confirmRoleChange(profile: Profile, newRole: UserRole) {
    try {
      await updateUserRole(profile.user_id, newRole);
      setRows((prev) =>
        prev.map((p) => (p.user_id === profile.user_id ? { ...p, role: newRole } : p))
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo cambiar el rol.';
      Alert.alert('Error', message);
    }
  }

  async function handleInvite(email: string, role: UserRole) {
    const { error: fnError } = await supabase.functions.invoke('invite-user', {
      body: { email, role },
    });
    if (fnError) throw new Error(fnError.message);
    load({ search, role: roleFilter, page: 0, append: false });
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Usuarios',
          headerShown: true,
          headerRight: isAdmin
            ? () => (
                <Pressable
                  onPress={() => setInviteVisible(true)}
                  className="mr-1 px-3 py-1.5 bg-nun-brown rounded-xl active:opacity-70"
                  accessibilityLabel="Invitar usuario"
                >
                  <Text className="text-white text-[13px] font-semibold">+ Invitar</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <View className="px-4 pt-3 pb-2 gap-3">
        {/* Search */}
        <TextInput
          className="bg-white border border-nun-parchment rounded-xl px-4 py-2.5 text-[15px] text-nun-dark"
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Buscar por nombre o email…"
          placeholderTextColor="#8C7B6A"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        {/* Role filter */}
        <View className="flex-row gap-2">
          {ROLE_FILTERS.map((f) => (
            <Pressable
              key={f.label}
              onPress={() => setRoleFilter(f.value)}
              className={`px-3 py-1.5 rounded-full border ${
                roleFilter === f.value
                  ? 'bg-nun-brown border-nun-brown'
                  : 'bg-white border-nun-parchment'
              }`}
            >
              <Text
                className={`text-[13px] font-medium ${roleFilter === f.value ? 'text-white' : 'text-nun-dark'}`}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6B4F3A" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-nun-muted text-center">{error}</Text>
          <Button
            label="Reintentar"
            variant="secondary"
            onPress={() => load({ search, role: roleFilter, page: 0, append: false })}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <UserRow item={item} isAdmin={isAdmin} onChangeRole={handleChangeRole} />
          )}
          contentContainerClassName="px-4 pt-1 pb-6"
          ListEmptyComponent={
            <View className="items-center justify-center pt-16">
              <Text className="text-nun-muted">No hay usuarios.</Text>
            </View>
          }
          ListFooterComponent={
            rows.length < total ? (
              <Button
                label={isLoadingMore ? 'Cargando…' : `Cargar más (${total - rows.length} restantes)`}
                variant="secondary"
                disabled={isLoadingMore}
                onPress={handleLoadMore}
                className="mt-2"
              />
            ) : null
          }
        />
      )}

      <InviteModal
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
        onInvite={handleInvite}
      />
    </SafeAreaView>
  );
}
