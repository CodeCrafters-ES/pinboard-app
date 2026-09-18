import type { SupabaseClient } from '@supabase/supabase-js';

import { blockUser, unblockUser, getBlockState, listMyBlocks } from '@/lib/blocks';
import type { Database } from '@/lib/database.types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type FakeClient = SupabaseClient<Database>;

function authWith(userId: string | null) {
  return {
    getUser: jest.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
  };
}

describe('lib/blocks', () => {
  describe('blockUser', () => {
    it('hace upsert de mi fila ignorando duplicados', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: null });
      const from = jest.fn(() => ({ upsert }));

      await blockUser({
        userId: 'u2',
        client: { auth: authWith('me'), from } as unknown as FakeClient,
      });

      expect(from).toHaveBeenCalledWith('user_blocks');
      expect(upsert).toHaveBeenCalledWith(
        { blocker_user_id: 'me', blocked_user_id: 'u2' },
        { onConflict: 'blocker_user_id,blocked_user_id', ignoreDuplicates: true },
      );
    });

    it('lanza si no hay sesión', async () => {
      const from = jest.fn();
      await expect(
        blockUser({ userId: 'u2', client: { auth: authWith(null), from } as unknown as FakeClient }),
      ).rejects.toThrow('No autenticado');
      expect(from).not.toHaveBeenCalled();
    });

    it('propaga el error de la BD', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: { message: 'denied' } });
      const from = jest.fn(() => ({ upsert }));
      await expect(
        blockUser({ userId: 'u2', client: { auth: authWith('me'), from } as unknown as FakeClient }),
      ).rejects.toEqual({ message: 'denied' });
    });
  });

  describe('unblockUser', () => {
    it('borra mi fila por (blocker, blocked)', async () => {
      const eqBlocked = jest.fn().mockResolvedValue({ error: null });
      const eqBlocker = jest.fn(() => ({ eq: eqBlocked }));
      const del = jest.fn(() => ({ eq: eqBlocker }));
      const from = jest.fn(() => ({ delete: del }));

      await unblockUser({
        userId: 'u2',
        client: { auth: authWith('me'), from } as unknown as FakeClient,
      });

      expect(from).toHaveBeenCalledWith('user_blocks');
      expect(eqBlocker).toHaveBeenCalledWith('blocker_user_id', 'me');
      expect(eqBlocked).toHaveBeenCalledWith('blocked_user_id', 'u2');
    });
  });

  describe('getBlockState', () => {
    function buildClient(mineData: unknown, rpcData: unknown) {
      const maybeSingle = jest.fn().mockResolvedValue({ data: mineData, error: null });
      const eqBlocked = jest.fn(() => ({ maybeSingle }));
      const eqBlocker = jest.fn(() => ({ eq: eqBlocked }));
      const select = jest.fn(() => ({ eq: eqBlocker }));
      const from = jest.fn(() => ({ select }));
      const rpc = jest.fn().mockResolvedValue({ data: rpcData, error: null });
      return { client: { auth: authWith('me'), from, rpc } as unknown as FakeClient, rpc };
    }

    it('iBlocked=true cuando existe mi fila; blocked según direct_chat_blocked', async () => {
      const { client, rpc } = buildClient({ blocked_user_id: 'u2' }, true);
      const state = await getBlockState({ partnerId: 'u2', client });
      expect(state).toEqual({ iBlocked: true, blocked: true });
      expect(rpc).toHaveBeenCalledWith('direct_chat_blocked', { other_user: 'u2' });
    });

    it('iBlocked=false si no hay fila propia pero blocked=true (me bloquearon a mí)', async () => {
      const { client } = buildClient(null, true);
      const state = await getBlockState({ partnerId: 'u2', client });
      expect(state).toEqual({ iBlocked: false, blocked: true });
    });

    it('sin bloqueo en ningún sentido', async () => {
      const { client } = buildClient(null, false);
      const state = await getBlockState({ partnerId: 'u2', client });
      expect(state).toEqual({ iBlocked: false, blocked: false });
    });
  });

  describe('listMyBlocks', () => {
    it('devuelve los bloqueados resolviendo nombre/avatar y preservando el orden', async () => {
      const order = jest.fn().mockResolvedValue({
        data: [
          { blocked_user_id: 'u2', created_at: '2026-08-06T10:00:00Z' },
          { blocked_user_id: 'u3', created_at: '2026-08-05T10:00:00Z' },
        ],
        error: null,
      });
      const eqBlocker = jest.fn(() => ({ order }));
      const selectBlocks = jest.fn(() => ({ eq: eqBlocker }));

      const inFn = jest.fn().mockResolvedValue({
        data: [{ user_id: 'u2', full_name: 'Ada Lovelace', name: 'Ada', surname: 'Lovelace', avatar_url: 'http://a/x.webp' }],
        error: null,
      });
      const selectProfiles = jest.fn(() => ({ in: inFn }));

      const from = jest.fn((table: string) =>
        table === 'user_blocks' ? { select: selectBlocks } : { select: selectProfiles },
      );

      const rows = await listMyBlocks({
        client: { auth: authWith('me'), from } as unknown as FakeClient,
      });

      expect(from).toHaveBeenCalledWith('user_blocks');
      expect(eqBlocker).toHaveBeenCalledWith('blocker_user_id', 'me');
      expect(from).toHaveBeenCalledWith('profiles_public');
      expect(inFn).toHaveBeenCalledWith('user_id', ['u2', 'u3']);

      expect(rows).toEqual([
        { userId: 'u2', fullName: 'Ada Lovelace', avatarUrl: 'http://a/x.webp', createdAt: '2026-08-06T10:00:00Z' },
        // u3 sin perfil resuelto → fallback 'Usuario', sin avatar.
        { userId: 'u3', fullName: 'Usuario', avatarUrl: null, createdAt: '2026-08-05T10:00:00Z' },
      ]);
    });

    it('no consulta perfiles si no hay bloqueos', async () => {
      const order = jest.fn().mockResolvedValue({ data: [], error: null });
      const eqBlocker = jest.fn(() => ({ order }));
      const selectBlocks = jest.fn(() => ({ eq: eqBlocker }));
      const from = jest.fn(() => ({ select: selectBlocks }));

      const rows = await listMyBlocks({
        client: { auth: authWith('me'), from } as unknown as FakeClient,
      });

      expect(rows).toEqual([]);
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith('user_blocks');
    });

    it('propaga el error al listar bloqueos', async () => {
      const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      const eqBlocker = jest.fn(() => ({ order }));
      const selectBlocks = jest.fn(() => ({ eq: eqBlocker }));
      const from = jest.fn(() => ({ select: selectBlocks }));

      await expect(
        listMyBlocks({ client: { auth: authWith('me'), from } as unknown as FakeClient }),
      ).rejects.toEqual({ message: 'boom' });
    });
  });
});
