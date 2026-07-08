import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { resetPasswordForEmail } from '@/lib/auth';

// ─── Validation ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(v: string): string | null {
  if (!v.trim()) return 'El correo es obligatorio.';
  if (!EMAIL_REGEX.test(v.trim())) return 'Introduce un correo válido.';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

type SendStatus = 'idle' | 'sending' | 'sent';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<SendStatus>('idle');

  async function handleSubmit() {
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;

    setStatus('sending');
    try {
      await resetPasswordForEmail(email.trim());
    } catch {
      // Supabase returns 200 whether or not the email exists — absorb errors
      // to avoid revealing registration status.
    } finally {
      setStatus('sent');
    }
  }

  const isSent = status === 'sent';
  const isSending = status === 'sending';

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
              Recuperar contraseña
            </Text>
            <Text className="text-[14px] text-nun-muted text-center">
              Te enviaremos un enlace para restablecer tu contraseña.
            </Text>
          </View>

          {/* Form card */}
          <View className="bg-white rounded-2xl shadow-sm p-6 gap-4">
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-nun-dark">Email</Text>
              <TextInput
                className={`bg-nun-sand border rounded-xl px-4 py-3 text-[15px] text-nun-dark ${emailError ? 'border-nun-error' : 'border-nun-parchment'}`}
                placeholder="nombre@nunibiza.com"
                placeholderTextColor="#8C7B6A"
                value={email}
                onChangeText={(v) => { setEmail(v); setEmailError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!isSent && !isSending}
                onSubmitEditing={handleSubmit}
                returnKeyType="send"
              />
              {emailError ? (
                <Text className="text-xs text-nun-error">{emailError}</Text>
              ) : null}
            </View>

            {isSent ? (
              <Text className="text-[14px] text-nun-sage text-center">
                Si el email está registrado, recibirás un enlace en breve.
              </Text>
            ) : null}

            <Pressable
              className={`bg-nun-brown rounded-xl py-4 items-center justify-center active:opacity-80 ${isSent || isSending ? 'opacity-40' : ''}`}
              onPress={handleSubmit}
              disabled={isSent || isSending}
              accessibilityRole="button"
              accessibilityLabel="Enviar enlace de recuperación"
            >
              <Text className="text-white text-[15px] font-semibold">
                {isSending ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              accessibilityRole="link"
              className="items-center"
            >
              <Text className="text-xs text-nun-sea">Volver al inicio de sesión</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
