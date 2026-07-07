import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  Text,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AtSign, Lock } from 'lucide-react-native';

import { signInWithPassword } from '@/lib/auth';
import { useSession } from '@/hooks/useSession';

// ─── Validation ────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(v: string) {
  if (!v.trim()) return 'El correo es obligatorio.';
  if (!EMAIL_REGEX.test(v.trim())) return 'Introduce un correo válido.';
  return null;
}

function validatePassword(v: string) {
  if (!v) return 'La contraseña es obligatoria.';
  if (v.length < 8) return 'Mínimo 8 caracteres.';
  return null;
}

// ─── Auth error classification ──────────────────────────────────────────────

type AuthError = 'invalid_credentials' | 'email_not_confirmed' | 'network';

function classifyError(message: string): AuthError {
  if (message.includes('Invalid login credentials')) return 'invalid_credentials';
  if (message.includes('Email not confirmed')) return 'email_not_confirmed';
  return 'network';
}

const AUTH_ERROR_MESSAGES: Record<AuthError, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de entrar.',
  network: 'Sin conexión. Comprueba tu red.',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const { session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect once useSession resolves the profile after a successful sign-in
  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    // All roles share the unified tab bar; land everyone on the Tablón tab.
    router.replace('/(app)/(tabs)/tablon' as never);
  }, [status, session, router]);

  async function handleLogin() {
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setAuthError(null);
    setIsSubmitting(true);
    try {
      await signInWithPassword(email.trim(), password);
      // Navigation handled by the effect above once useSession reports 'authenticated'
    } catch (e) {
      setAuthError(classifyError(e instanceof Error ? e.message : ''));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = !isSubmitting;

  return (
    <SafeAreaView className="flex-1 bg-nun-linen">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-5 py-8"
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View className="items-center mb-8">
            <Text className="text-[32px] font-bold text-nun-brown tracking-tight">nūn</Text>
            <Text className="text-[15px] text-nun-muted text-center mt-1 leading-snug">
              Elegancia mediterránea para tu gestión diaria.
            </Text>
          </View>

          {/* Form card */}
          <View className="bg-white rounded-2xl shadow-sm p-6 gap-4">

            {/* Email */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-nun-dark">Email</Text>
              <View className={`flex-row items-center bg-nun-sand border rounded-xl px-4 py-3 gap-2 ${emailError ? 'border-nun-error' : 'border-nun-parchment'}`}>
                <AtSign size={16} color={emailError ? '#C0392B' : '#8C7B6A'} />
                <TextInput
                  className="flex-1 text-[15px] text-nun-dark"
                  placeholder="nombre@nunibiza.com"
                  placeholderTextColor="#8C7B6A"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setEmailError(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!isSubmitting}
                />
              </View>
              {emailError && (
                <Text className="text-xs text-nun-error">{emailError}</Text>
              )}
            </View>

            {/* Password */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-nun-dark">Contraseña</Text>
              <View className={`flex-row items-center bg-nun-sand border rounded-xl px-4 py-3 gap-2 ${passwordError ? 'border-nun-error' : 'border-nun-parchment'}`}>
                <Lock size={16} color={passwordError ? '#C0392B' : '#8C7B6A'} />
                <TextInput
                  className="flex-1 text-[15px] text-nun-dark"
                  placeholder="••••••••"
                  placeholderTextColor="#8C7B6A"
                  value={password}
                  onChangeText={(v) => { setPassword(v); setPasswordError(null); }}
                  secureTextEntry
                  textContentType="password"
                  editable={!isSubmitting}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
              </View>
              {passwordError && (
                <Text className="text-xs text-nun-error">{passwordError}</Text>
              )}
            </View>

            {/* Auth error */}
            {authError && (
              <Text className="text-xs text-nun-error -mt-1">
                {AUTH_ERROR_MESSAGES[authError]}
              </Text>
            )}

            {/* Submit button */}
            <Pressable
              className={`bg-nun-brown rounded-xl py-4 items-center justify-center active:opacity-80 ${!canSubmit ? 'opacity-40' : ''}`}
              onPress={handleLogin}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Entrar"
            >
              <Text className="text-white text-[15px] font-semibold">
                {isSubmitting ? 'Entrando…' : 'Entrar →'}
              </Text>
            </Pressable>

            {/* Forgot password */}
            <View className="items-center">
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="link"
              >
                <Text className="text-xs text-nun-sea">¿Olvidaste tu contraseña?</Text>
              </Pressable>
            </View>
          </View>

          {/* Caption */}
          <Text className="text-xs text-nun-muted text-center mt-4">
            El acceso lo gestiona tu administrador
          </Text>

          {/* Decorative sea element */}
          <View className="mt-5 h-36 rounded-2xl bg-nun-sky overflow-hidden">
            <View className="absolute inset-0 bg-nun-sand opacity-30" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
