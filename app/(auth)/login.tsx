import { useState } from 'react';
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
import { AtSign, Lock } from 'lucide-react-native';

import { signInWithPassword } from '@/lib/auth';

type AuthError = 'invalid_credentials' | 'email_not_confirmed' | 'network' | null;

function classifyError(message: string): AuthError {
  if (message.includes('Invalid login credentials')) return 'invalid_credentials';
  if (message.includes('Email not confirmed')) return 'email_not_confirmed';
  return 'network';
}

const ERROR_MESSAGES: Record<NonNullable<AuthError>, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de entrar.',
  network: 'Sin conexión. Comprueba tu red.',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthError>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleLogin() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithPassword(email.trim(), password);
      // Navigation handled automatically by useSession + AppLayout guard
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(classifyError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

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
              <View className="flex-row items-center bg-nun-sand border border-nun-parchment rounded-xl px-4 py-3 gap-2">
                <AtSign size={16} color="#8C7B6A" />
                <TextInput
                  className="flex-1 text-[15px] text-nun-dark"
                  placeholder="nombre@nunibiza.com"
                  placeholderTextColor="#8C7B6A"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!isSubmitting}
                />
              </View>
            </View>

            {/* Password */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-nun-dark">Contraseña</Text>
              <View className="flex-row items-center bg-nun-sand border border-nun-parchment rounded-xl px-4 py-3 gap-2">
                <Lock size={16} color="#8C7B6A" />
                <TextInput
                  className="flex-1 text-[15px] text-nun-dark"
                  placeholder="••••••••"
                  placeholderTextColor="#8C7B6A"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textContentType="password"
                  editable={!isSubmitting}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
              </View>
            </View>

            {/* Error message */}
            {error && (
              <Text className="text-xs text-nun-error -mt-1">
                {ERROR_MESSAGES[error]}
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
