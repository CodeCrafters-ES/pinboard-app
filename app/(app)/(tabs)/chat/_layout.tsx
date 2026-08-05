import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Chats', headerTintColor: '#7D5A3A' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[chatId]" options={{ title: 'Chat' }} />
      <Stack.Screen name="nuevo" options={{ title: 'Nuevo chat', presentation: 'modal' }} />
    </Stack>
  );
}
