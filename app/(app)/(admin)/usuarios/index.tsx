import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { useSession } from '@/hooks/useSession';
import { useUserList } from '@/hooks/useUserList';
import { Button } from '@/components/ui';
import type { ProfileRow } from '@/lib/supabase/queries/profiles';
import type { Database } from '@/lib/database.types';

type UserRole = Database['public']['Enums']['user_role'];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const BADGE_BG: Record<UserRole, string> = {
  admin: 'bg-nun-brown',
  manager: 'bg-nun-sea',
  staff: 'bg-nun-parchment',
};

const BADGE_TEXT: Record<UserRole, string> = {
  admin: 'text-white',
  manager: 'text-white',
  staff: 'text-nun-dark',
};

const FILTER_TABS: { label: string; value: UserRole | undefined }[] = [
  { label: 'Todos', value: undefined },
  { label: 'Staff', value: 'staff' },
  { label: 'Manager', value: 'manager' },
  { label: 'Admin', value: 'admin' },
];

const ALL_ROLES: UserRole[] = ['staff', 'manager', 'admin'];

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${BADGE_BG[role]}`}>
      <Text className={`text-xs font-medium ${BADGE_TEXT[role]}`}>{ROLE_LABEL[role]}</Text>
    </View>
  );
}

function UserRow({
  item,
  onChangeRole,
}: {
  item: ProfileRow;
  onChangeRole: (profile: ProfileRow) => void;
}) {
  const initials =
    [item.name, item.surname]
      .filter(Boolean)
      .map((w) => w![0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const displayName = [item.name, item.surname].filter(Boolean).join(' ') || item.email;

  return (
    <View className="flex-row items-center px-4 py-3 bg-white border-b border-nun-parchment gap-3">
      <View className="w-10 h-10 rounded-full bg-nun-sand items-center justify-center flex-shrink-0">
        <Text className="text-[15px] font-semibold text-nun-muted">{initials}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold text-nun-dark" numberOfLines={1}>
          {displayName}
        </Text>
        {item.title ? (
          <Text className="text-xs text-nun-muted" numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
      </View>
      <RoleBadge role={item.role} />
      <Pressable
        onPress={() => onChangeRole(item)}
        accessibilityRole="button"
        accessibilityLabel={`Cambiar rol de ${displayName}`}
        className="ml-1 rounded-lg px-2 py-1.5 bg-nun-sand active:opacity-70"
      >
        <Text className="text-xs font-medium text-nun-brown">Cambiar rol</Text>
      </Pressable>
    </View>
  );
}

type ModalState = {
  visible: boolean;
  target: ProfileRow | null;
  selectedRole: UserRole;
};

type Banner = { type: 'ok' | 'err'; msg: string } | null;

export default function UsuariosScreen() {
  const { profile: currentProfile } = useSession();
  const [activeFilter, setActiveFilter] = useState<UserRole | undefined>(undefined);
  const { profiles, loading, error, changeRole, refresh } = useUserList(
    activeFilter ? { role: activeFilter } : undefined
  );

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    target: null,
    selectedRole: 'staff',
  });
  const [confirming, setConfirming] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((type: 'ok' | 'err', msg: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, msg });
    bannerTimer.current = setTimeout(() => setBanner(null), 3000);
  }, []);

  const openModal = useCallback((profile: ProfileRow) => {
    setModal({ visible: true, target: profile, selectedRole: profile.role });
  }, []);

  const closeModal = useCallback(() => {
    setModal((m) => ({ ...m, visible: false }));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!modal.target || !currentProfile) return;
    const targetName =
      [modal.target.name, modal.target.surname].filter(Boolean).join(' ') || modal.target.email;
    setConfirming(true);
    try {
      await changeRole(modal.target.id, modal.selectedRole, currentProfile);
      closeModal();
      showBanner('ok', `Rol de ${targetName} actualizado a ${ROLE_LABEL[modal.selectedRole]}.`);
    } catch (e) {
      closeModal();
      showBanner('err', e instanceof Error ? e.message : 'No se pudo cambiar el rol.');
    } finally {
      setConfirming(false);
    }
  }, [modal, currentProfile, changeRole, closeModal, showBanner]);

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Usuarios', headerShown: true }} />

      {banner ? (
        <View className={`px-4 py-2 ${banner.type === 'ok' ? 'bg-nun-sage' : 'bg-nun-error'}`}>
          <Text className="text-white text-sm text-center">{banner.msg}</Text>
        </View>
      ) : null}

      <View className="flex-row bg-white border-b border-nun-parchment">
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.label}
            onPress={() => setActiveFilter(tab.value)}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeFilter === tab.value ? 'border-nun-brown' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-[13px] font-medium ${
                activeFilter === tab.value ? 'text-nun-brown' : 'text-nun-muted'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6B4C3B" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Text className="text-nun-muted text-center">{error}</Text>
          <Button label="Reintentar" variant="secondary" onPress={refresh} />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow item={item} onChangeRole={openModal} />}
          ListEmptyComponent={
            <View className="pt-16 items-center">
              <Text className="text-nun-muted">No hay usuarios.</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={modal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={closeModal}
        >
          <View className="bg-white rounded-t-2xl px-6 pt-5 pb-8">
            <Text className="text-[17px] font-bold text-nun-dark mb-1">Cambiar rol</Text>
            {modal.target ? (
              <Text className="text-sm text-nun-muted mb-5">
                {[modal.target.name, modal.target.surname].filter(Boolean).join(' ') ||
                  modal.target.email}
              </Text>
            ) : null}

            <View className="flex-row gap-2 mb-6">
              {ALL_ROLES.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setModal((m) => ({ ...m, selectedRole: r }))}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    modal.selectedRole === r
                      ? 'border-nun-brown bg-nun-brown'
                      : 'border-nun-parchment bg-nun-sand'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      modal.selectedRole === r ? 'text-white' : 'text-nun-dark'
                    }`}
                  >
                    {ROLE_LABEL[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row gap-3">
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={closeModal}
                className="flex-1"
              />
              <Button
                label={confirming ? 'Guardando…' : 'Confirmar'}
                variant="primary"
                disabled={confirming || modal.selectedRole === modal.target?.role}
                onPress={handleConfirm}
                className="flex-1"
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
