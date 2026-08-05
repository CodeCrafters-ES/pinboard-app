import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createOrGetDirectChat,
  listMyChats,
  displayContent,
  type Message,
} from '@/lib/chat';
import type { Database } from '@/lib/database.types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type FakeClient = SupabaseClient<Database>;

describe('lib/chat', () => {
  describe('createOrGetDirectChat', () => {
    it('llama a la RPC con other_user y devuelve el chat_id', async () => {
      const rpc = jest.fn().mockResolvedValue({ data: 'chat-1', error: null });
      const id = await createOrGetDirectChat({
        otherUserId: 'u2',
        client: { rpc } as unknown as FakeClient,
      });
      expect(id).toBe('chat-1');
      expect(rpc).toHaveBeenCalledWith('create_or_get_direct_chat', { other_user: 'u2' });
    });

    it('propaga el error de la RPC', async () => {
      const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      await expect(
        createOrGetDirectChat({ otherUserId: 'u2', client: { rpc } as unknown as FakeClient }),
      ).rejects.toEqual({ message: 'boom' });
    });
  });

  describe('listMyChats', () => {
    it('mapea las filas de my_chats_v con fallbacks para los nulos', async () => {
      const order = jest.fn().mockResolvedValue({
        data: [
          {
            chat_id: 'c1',
            is_group: false,
            last_message_at: '2026-08-06T10:00:00Z',
            last_read_at: '2026-08-06T09:00:00Z',
            unread_count: 3,
            partner_user_id: 'u2',
            partner_name: 'Ada',
            partner_avatar_url: null,
            last_message_sender_id: 'u2',
            last_message_content: 'hola',
          },
          {
            chat_id: 'c2',
            is_group: null,
            last_message_at: null,
            last_read_at: null,
            unread_count: null,
            partner_user_id: null,
            partner_name: null,
            partner_avatar_url: null,
            last_message_sender_id: null,
            last_message_content: null,
          },
        ],
        error: null,
      });
      const select = jest.fn(() => ({ order }));
      const from = jest.fn(() => ({ select }));

      const rows = await listMyChats({ client: { from } as unknown as FakeClient });

      expect(from).toHaveBeenCalledWith('my_chats_v');
      expect(order).toHaveBeenCalledWith('last_message_at', { ascending: false });
      expect(rows[0]).toMatchObject({ chat_id: 'c1', unread_count: 3, partner_name: 'Ada' });
      // Fila con nulos: fallbacks a '' / false / 0 / null.
      expect(rows[1]).toEqual({
        chat_id: 'c2',
        is_group: false,
        last_message_at: '',
        last_read_at: '',
        unread_count: 0,
        partner_user_id: null,
        partner_name: null,
        partner_avatar_url: null,
        last_message_sender_id: null,
        last_message_content: null,
      });
    });
  });

  describe('displayContent', () => {
    const base: Pick<Message, 'content' | 'deleted_at'> = { content: 'hola', deleted_at: null };
    it('devuelve el content si no está borrado', () => {
      expect(displayContent(base)).toBe('hola');
    });
    it('enmascara los borrados', () => {
      expect(displayContent({ ...base, deleted_at: '2026-08-06T12:00:00Z' })).toBe('Mensaje eliminado');
    });
  });
});
