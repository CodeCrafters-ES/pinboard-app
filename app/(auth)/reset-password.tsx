import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

// ─── URL token parsing (shared pattern with set-password) ─────────────────────

function parseAuthFragment(url: string) {
  const fragment = url.split('#')[1] ?? '';
  const p = new URLSearchParams(fragment);
  const queryPart = url.split('?')[1]?.split('#')[0] ?? '';
  const q = new URLSearchParams(queryPart);
  return {
    accessToken: p.get('access_token') ?? undefined,
    refreshToken: p.get('refresh_token') ?? undefined,
    tokenHash: q.get('token_hash') ?? undefined,
    type: p.get('type') ?? q.get('type') ?? undefined,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

type TokenStatus = 'loading' | 'ready' | 'error';

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const isFormValid = password.length >= 8 && password === confirm;

  // Subscribe to PASSWORD_RECOVERY to confirm the recovery token was accepted
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setTokenStatus('ready');
    });

    async function applyToken(url: string) {
      const { accessToken, refreshToken, tokenHash, type } = parseAuthFragment(url);
      try {
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'recovery',
          });
          if (error) throw error;
          // onAuthStateChange PASSWORD_RECOVERY → tokenStatus: 'ready'
        } else if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? '',
          });
          if (error) throw error;
          // onAuthStateChange PASSWORD_RECOVERY → tokenStatus: 'ready'
        } else {
          throw new Error('no_token');
        }
      } catch {
        setTokenStatus('error');
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) applyToken(url);
      else setTokenStatus('error');
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    if (!isFormValid) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al guardar la contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (tokenStatus === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-nun-linen items-center justify-center">
        <ActivityIndicator color="#7D5A3A" />
        <Text className="text-[14px] text-nun-muted mt-3">Verificando enlace…</Text>
      </SafeAreaView>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (tokenStatus === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-nun-linen items-center justify-center px-6">
        <Text className="text-[18px] font-semibold text-nun-dark text-center mb-2">
          Enlace expirado
        </Text>
        <Text className="text-[14px] text-nun-muted text-center mb-4">
          Este enlace de recuperación ha expirado o ya fue usado.
        </Text>
        <Pressable
          onPress={() => router.replace('/(auth)/forgot-password')}
          accessibilityRole="link"
        >
          <Text className="text-[14px] text-nun-sea font-medium">Solicitar nuevo enlace</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── Password form ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-nun-linen">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 justify-center px-5 py-8 gap-6">
          {/* Header */}
          <View className="items-center gap-1">
            <Text className="text-[32px] font-bold text-nun-brown tracking-tight">nūn</Text>
            <Text className="text-[22px] font-semibold text-nun-dark mt-2">
              Restablece tu contraseña
            </Text>
            <Text className="text-[14px] text-nun-muted text-center">
              Elige una contraseña segura para recuperar el acceso.
            </Text>
          </View>

          {/* Form */}
          <View className="bg-white rounded-2xl shadow-sm p-6 gap-4">
            <PasswordField
              label="Nueva contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              textContentType="newPassword"
            />
            <PasswordField
              label="Confirmar contraseña"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repite la contraseña"
              textContentType="newPassword"
              onSubmitEditing={handleSubmit}
            />

            {saved ? (
              <Text className="text-[14px] text-nun-sage text-center">
                Contraseña cambiada. Inicia sesión.
              </Text>
            ) : null}

            {submitError ? (
              <Text className="text-xs text-nun-error">{submitError}</Text>
            ) : null}

            <Pressable
              className={`bg-nun-brown rounded-xl py-4 items-center justify-center active:opacity-80 ${!isFormValid || isSubmitting ? 'opacity-40' : ''}`}
              onPress={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Cambiar contraseña"
            >
              <Text className="text-white text-[15px] font-semibold">
                {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Shared field ──────────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  textContentType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  textContentType?: 'password' | 'newPassword';
  onSubmitEditing?: () => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-medium text-nun-dark">{label}</Text>
      <TextInput
        className="bg-nun-sand border border-nun-parchment rounded-xl px-4 py-3 text-[15px] text-nun-dark"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8C7B6A"
        secureTextEntry
        textContentType={textContentType}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? 'go' : 'next'}
      />
    </View>
  );
}
