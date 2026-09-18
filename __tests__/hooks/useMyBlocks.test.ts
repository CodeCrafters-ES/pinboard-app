import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useMyBlocks } from '@/hooks/useMyBlocks';
import { listMyBlocks, unblockUser, type BlockedUser } from '@/lib/blocks';

jest.mock('@/lib/blocks', () => ({
  listMyBlocks: jest.fn(),
  unblockUser: jest.fn(),
}));

const mockList = listMyBlocks as jest.MockedFunction<typeof listMyBlocks>;
const mockUnblock = unblockUser as jest.MockedFunction<typeof unblockUser>;

function blocked(userId: string): BlockedUser {
  return { userId, fullName: `User ${userId}`, avatarUrl: null, createdAt: '2026-08-06T10:00:00Z' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnblock.mockResolvedValue(undefined);
});

describe('useMyBlocks', () => {
  it('carga inicial: expone la lista de bloqueados', async () => {
    mockList.mockResolvedValueOnce([blocked('u2'), blocked('u3')]);

    const { result } = renderHook(() => useMyBlocks());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.blocks.map((b) => b.userId)).toEqual(['u2', 'u3']);
    expect(result.current.error).toBeNull();
  });

  it('expone error si la carga falla', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useMyBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('No se pudieron cargar tus bloqueos.');
    expect(result.current.blocks).toEqual([]);
  });

  it('unblock quita la fila de forma optimista y persiste', async () => {
    mockList.mockResolvedValueOnce([blocked('u2'), blocked('u3')]);

    const { result } = renderHook(() => useMyBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.unblock('u2');
    });

    expect(result.current.blocks.map((b) => b.userId)).toEqual(['u3']);
    expect(mockUnblock).toHaveBeenCalledWith({ userId: 'u2' });
  });

  it('unblock restaura la fila si la BD falla', async () => {
    mockList.mockResolvedValueOnce([blocked('u2'), blocked('u3')]);
    mockUnblock.mockRejectedValueOnce(new Error('denied'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() => useMyBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.unblock('u2');
    });

    expect(result.current.blocks.map((b) => b.userId)).toEqual(['u2', 'u3']);
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
