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
import { useSession } from '@/hooks/useSession';

// ─── URL token parsing ────────────────────────────────────────────────────────

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

export default function SetPasswordScreen() {
  const router = useRouter();
  const { session, status } = useSession();

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Derived: form is valid when both fields meet requirements
  const isFormValid = password.length >= 8 && password === confirm;

  // Subscribe to SIGNED_IN to confirm the token was applied successfully
  useEffect(() => {
    let handled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setTokenStatus('ready');
    });

    async function applyToken(url: string) {
      if (handled) return;
      const { accessToken, refreshToken, tokenHash, type } = parseAuthFragment(url);
      // Ignore URLs without an auth token (e.g. the stale launch URL on warm start):
      // wait for the real invite link to arrive via the `url` event instead of erroring.
      if (!tokenHash && !accessToken) return;
      handled = true;
      try {
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'invite',
          });
          if (error) throw error;
          // onAuthStateChange SIGNED_IN → tokenStatus: 'ready'
        } else {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken!,
            refresh_token: refreshToken ?? '',
          });
          if (error) throw error;
          // onAuthStateChange SIGNED_IN → tokenStatus: 'ready'
        }
      } catch {
        setTokenStatus('error');
      }
    }

    // Warm start: app already open, invite link arrives as a `url` event.
    const linkSub = Linking.addEventListener('url', ({ url }) => applyToken(url));

    // Cold start: app launched by the invite link.
    Linking.getInitialURL().then((url) => {
      if (url) applyToken(url);
    });

    // If no valid token arrives shortly (bad/expired link, or none at all), surface the error.
    const timeout = setTimeout(() => {
      if (!handled) setTokenStatus('error');
    }, 3000);

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
      clearTimeout(timeout);
    };
  }, []);

  // Navigate to role screen once session confirmed after password save
  useEffect(() => {
    if (!saved || status !== 'authenticated' || !session) return;
    // All roles share the unified tab bar; land everyone on the Tablón tab.
    router.replace('/(app)/(tabs)/tablon' as never);
  }, [saved, status, session, router]);

  async function handleSubmit() {
    if (!isFormValid) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al guardar la contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (tokenStatus === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-nun-linen items-center justify-center">
        <ActivityIndicator color="#7D5A3A" />
      </SafeAreaView>
    );
  }

  if (tokenStatus === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-nun-linen items-center justify-center px-6">
        <Text className="text-[18px] font-semibold text-nun-dark text-center mb-2">
          Enlace inválido
        </Text>
        <Text className="text-[14px] text-nun-muted text-center">
          Este enlace de invitación ha expirado o ya fue usado. Pide a tu administrador que te
          envíe uno nuevo.
        </Text>
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
              Establece tu contraseña
            </Text>
            <Text className="text-[14px] text-nun-muted text-center">
              Elige una contraseña segura para acceder a tu cuenta.
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

            {submitError ? (
              <Text className="text-xs text-nun-error">{submitError}</Text>
            ) : null}

            <Pressable
              className={`bg-nun-brown rounded-xl py-4 items-center justify-center active:opacity-80 ${!isFormValid || isSubmitting ? 'opacity-40' : ''}`}
              onPress={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Guardar contraseña"
            >
              <Text className="text-white text-[15px] font-semibold">
                {isSubmitting ? 'Guardando…' : 'Guardar y entrar →'}
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
