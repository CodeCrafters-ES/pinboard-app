import { useState, useRef } from 'react';
import { View, Modal, TextInput, Pressable, Text as RNText } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { Text, Button } from '@/components/ui';

const ROLES = ['staff', 'manager', 'admin'] as const;
type UserRole = (typeof ROLES)[number];
const ROLE_LABEL: Record<UserRole, string> = { staff: 'Staff', manager: 'Manager', admin: 'Admin' };

type Banner = { type: 'ok' | 'err'; msg: string } | null;

export default function AdminPanel() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBanner(type: 'ok' | 'err', msg: string) {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, msg });
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  }

  function openModal() {
    setEmail('');
    setRole('staff');
    setEmailError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
  }

  async function handleSend() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError('Introduce un email válido.');
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email: trimmed, role },
      });
      if (error) throw error;
      closeModal();
      showBanner('ok', `Invitación enviada a ${trimmed}.`);
    } catch (e) {
      closeModal();
      showBanner('err', e instanceof Error ? e.message : 'Error al enviar la invitación.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="flex-1 bg-nun-linen">
      {banner ? (
        <View className={`px-4 py-2 ${banner.type === 'ok' ? 'bg-nun-sage' : 'bg-nun-error'}`}>
          <RNText className="text-white text-sm text-center">{banner.msg}</RNText>
        </View>
      ) : null}

      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-[22px] font-bold">Admin Panel</Text>
        <Button
          label="Gestionar posts"
          variant="primary"
          onPress={() => router.push('/(app)/(tabs)/admin/posts')}
          className="w-full"
        />
        <Button
          label="Gestionar usuarios"
          variant="secondary"
          onPress={() => router.push('/(app)/(tabs)/admin/users')}
          className="w-full"
        />
        <Button
          label="Invitar usuario"
          variant="secondary"
          onPress={openModal}
          className="w-full"
        />
        <Button
          label="Mi perfil"
          variant="secondary"
          onPress={() => router.push('/(app)/(tabs)/perfil')}
          className="w-full"
        />
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={closeModal}>
          <View className="bg-white rounded-t-2xl px-6 pt-5 pb-8">
            <Text className="text-[17px] font-bold text-nun-dark mb-4">Invitar usuario</Text>

            <View className="gap-1.5 mb-4">
              <RNText className="text-[13px] font-medium text-nun-dark">Email</RNText>
              <TextInput
                className={`bg-nun-sand border rounded-xl px-4 py-3 text-[15px] text-nun-dark ${emailError ? 'border-nun-error' : 'border-nun-parchment'}`}
                value={email}
                onChangeText={(v) => { setEmail(v); setEmailError(null); }}
                placeholder="nombre@ejemplo.com"
                placeholderTextColor="#8C7B6A"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emailError ? (
                <RNText className="text-xs text-nun-error">{emailError}</RNText>
              ) : null}
            </View>

            <View className="gap-1.5 mb-6">
              <RNText className="text-[13px] font-medium text-nun-dark">Rol</RNText>
              <View className="flex-row gap-2">
                {ROLES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${
                      role === r
                        ? 'border-nun-brown bg-nun-brown'
                        : 'border-nun-parchment bg-nun-sand'
                    }`}
                  >
                    <RNText
                      className={`text-sm font-semibold ${
                        role === r ? 'text-white' : 'text-nun-dark'
                      }`}
                    >
                      {ROLE_LABEL[r]}
                    </RNText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={closeModal}
                className="flex-1"
              />
              <Button
                label={sending ? 'Enviando…' : 'Enviar invitación'}
                variant="primary"
                disabled={sending}
                onPress={handleSend}
                className="flex-1"
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
