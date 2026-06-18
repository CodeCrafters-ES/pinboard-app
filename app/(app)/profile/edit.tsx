import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/hooks/useSession';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { updateOwnProfile } from '@/lib/auth';
import { Button } from '@/components/ui';

const ROLE_LABEL: Record<string, string> = {
  staff: 'Staff',
  manager: 'Manager',
  admin: 'Admin',
};

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  maxLength?: number;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-medium text-nun-dark">{label}</Text>
      <TextInput
        className={`bg-nun-sand border rounded-xl px-4 py-3 text-[15px] text-nun-dark ${error ? 'border-nun-error' : 'border-nun-parchment'}`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8C7B6A"
        maxLength={maxLength}
      />
      {error ? <Text className="text-xs text-nun-error">{error}</Text> : null}
    </View>
  );
}

export default function EditProfileScreen() {
  const { session, profile, refreshProfile } = useSession();
  const { upload, isUploading } = useAvatarUpload();
  const router = useRouter();

  const [name, setName] = useState(profile?.name ?? '');
  const [surname, setSurname] = useState(profile?.surname ?? '');
  const [title, setTitle] = useState(profile?.title ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync fields if profile loads after mount
  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setSurname(profile.surname ?? '');
      setTitle(profile.title ?? '');
    }
  }, [profile]);

  const initials = [name, surname]
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  async function handleAvatarPress() {
    try {
      // Stub: triggers useAvatarUpload from I-F-N01-01-04
      // ImagePicker integration happens in that issue
      await upload('placeholder');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error al subir la foto.';
      Alert.alert('Error', message);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setNameError('El nombre es obligatorio.');
      return;
    }
    if (!session) return;

    setNameError(null);
    setIsSaving(true);
    try {
      await updateOwnProfile(session.userId, {
        name: name.trim(),
        surname: surname.trim() || null,
        title: title.trim() || null,
      });
      await refreshProfile();
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo guardar el perfil.';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Editar perfil' }} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-6 gap-5"
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View className="items-center">
          <Pressable
            onPress={handleAvatarPress}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel="Cambiar foto de perfil"
            className="relative"
          >
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
            <View className="absolute bottom-0 right-0 bg-nun-brown rounded-full w-6 h-6 items-center justify-center">
              <Text className="text-white text-[10px] font-bold">+</Text>
            </View>
          </Pressable>
          <Text className="text-xs text-nun-muted mt-2">
            {isUploading ? 'Subiendo…' : 'Toca para cambiar la foto'}
          </Text>
        </View>

        {/* Editable fields */}
        <InputField
          label="Nombre"
          value={name}
          onChangeText={(v) => { setName(v); setNameError(null); }}
          placeholder="Tu nombre"
          error={nameError}
          maxLength={50}
        />

        <InputField
          label="Apellidos"
          value={surname}
          onChangeText={setSurname}
          placeholder="Tus apellidos"
          maxLength={80}
        />

        <InputField
          label="Cargo"
          value={title}
          onChangeText={setTitle}
          placeholder="Ej: Jefe de sala"
          maxLength={80}
        />

        {/* Role — read only */}
        <View className="gap-1.5">
          <Text className="text-[13px] font-medium text-nun-dark">Rol</Text>
          <View className="bg-nun-sand border border-nun-parchment rounded-xl px-4 py-3 flex-row items-center justify-between">
            <Text className="text-[15px] text-nun-muted">
              {session?.role ? ROLE_LABEL[session.role] : '—'}
            </Text>
            <View className="bg-nun-parchment rounded-full px-2 py-0.5">
              <Text className="text-xs text-nun-muted font-medium">Solo lectura</Text>
            </View>
          </View>
        </View>

        {/* Save */}
        <Button
          label={isSaving ? 'Guardando…' : 'Guardar'}
          variant="primary"
          disabled={isSaving}
          onPress={handleSave}
          className="mt-2"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
