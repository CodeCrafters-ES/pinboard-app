import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Text } from '@/components/ui';
import { ChatAvatar } from '@/components/chat';
import { useSession } from '@/hooks/useSession';
import { createOrGetDirectChat } from '@/lib/chat';
import { listProfilesPublic, type ProfilePublicRow } from '@/lib/supabase/queries/profiles';
import { reportError } from '@/lib/errors';

export default function NewChatScreen() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.userId ?? null;

  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProfilePublicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 350);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listProfilesPublic({ search: search.trim() || undefined, pageSize: 30 })
      .then(({ rows: data }) => {
        if (active) {
          setRows(data.filter((r) => r.user_id && r.user_id !== userId));
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(reportError('NewChatScreen', e, 'No se pudieron cargar los usuarios.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, userId]);

  async function startChat(row: ProfilePublicRow) {
    if (!row.user_id || creatingId) return;
    setCreatingId(row.user_id);
    try {
      const chatId = await createOrGetDirectChat({ otherUserId: row.user_id });
      router.replace({
        pathname: '/(app)/(tabs)/chat/[chatId]',
        params: {
          chatId,
          name: row.full_name ?? 'Chat',
          avatarUrl: row.avatar_url ?? '',
          partnerId: row.user_id,
        },
      } as never);
    } catch (e) {
      setError(reportError('NewChatScreen.start', e, 'No se pudo iniciar el chat.'));
      setCreatingId(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-nun-linen" edges={['bottom']}>
      <View className="px-4 pt-3 pb-2">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Buscar por nombre…"
          placeholderTextColor="#8C7B6A"
          autoFocus
          className="bg-white rounded-xl px-4 py-3 text-[15px] text-nun-dark"
          accessibilityLabel="Buscar usuario"
        />
      </View>

      {error ? <Text className="text-xs text-nun-error px-5 pb-2">{error}</Text> : null}

      {loading ? (
        <ActivityIndicator className="mt-8" color="#7D5A3A" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id ?? item.user_id ?? ''}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => startChat(item)}
              disabled={creatingId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Chatear con ${item.full_name ?? 'usuario'}`}
              className="flex-row items-center gap-3 px-4 py-3 active:bg-nun-sand"
            >
              <ChatAvatar url={item.avatar_url} name={item.full_name} size={44} />
              <Text className="text-[16px] text-nun-dark flex-1" numberOfLines={1}>
                {item.full_name ?? '—'}
              </Text>
              {creatingId === item.user_id ? <ActivityIndicator color="#7D5A3A" /> : null}
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View className="h-px bg-nun-parchment ml-[68px]" />}
          ListEmptyComponent={
            <View className="items-center pt-16">
              <Text className="text-nun-muted text-[15px]">No se encontraron usuarios.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
