import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useComments } from '@/hooks/useComments';
import { createComment, deleteComment, getCommentsCount, listComments } from '@/lib/comments';
import type { CommentAuthor, CommentWithAuthor } from '@/lib/comments';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/comments', () => ({
  listComments: jest.fn(),
  createComment: jest.fn(),
  deleteComment: jest.fn(),
  getCommentsCount: jest.fn(),
  MAX_COMMENT_LENGTH: 2000,
}));

const mockList = listComments as jest.MockedFunction<typeof listComments>;
const mockCreate = createComment as jest.MockedFunction<typeof createComment>;
const mockDelete = deleteComment as jest.MockedFunction<typeof deleteComment>;
const mockCount = getCommentsCount as jest.MockedFunction<typeof getCommentsCount>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AUTHOR: CommentAuthor = { user_id: 'u1', full_name: 'Ana', avatar_url: null };

function comment(id: string, authorId = 'u1'): CommentWithAuthor {
  return {
    id,
    post_id: 'p1',
    author_id: authorId,
    body: `body-${id}`,
    created_at: `2026-07-08T10:0${id}:00Z`,
    updated_at: `2026-07-08T10:0${id}:00Z`,
    author: { user_id: authorId, full_name: 'Ana', avatar_url: null },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCount.mockResolvedValue(0);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useComments', () => {
  it('carga los comentarios iniciales al montar', async () => {
    mockList.mockResolvedValueOnce({ rows: [comment('1')], nextCursor: null });
    mockCount.mockResolvedValueOnce(1);

    const { result } = renderHook(() => useComments('p1', AUTHOR));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.hasMore).toBe(false);
    expect(mockList).toHaveBeenCalledWith({ postId: 'p1', pageSize: 20 });
    expect(mockCount).toHaveBeenCalledWith('p1');
  });

  it('expone error cuando falla la carga', async () => {
    mockList.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useComments('p1', AUTHOR));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No se pudieron cargar los comentarios.');
  });

  it('add inserta de forma optimista y sustituye por la fila del servidor', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });
    mockCount.mockResolvedValueOnce(0);
    mockCreate.mockResolvedValueOnce({
      id: 'server-1',
      post_id: 'p1',
      author_id: 'u1',
      body: 'hola',
      created_at: '2026-07-08T11:00:00Z',
      updated_at: '2026-07-08T11:00:00Z',
    });

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('hola');
    });

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0]!.id).toBe('server-1');
    expect(result.current.comments[0]!.author).toEqual(AUTHOR);
    expect(result.current.total).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith({ postId: 'p1', body: 'hola' });
  });

  it('add hace rollback si el servidor falla', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });
    mockCreate.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('hola');
    });

    expect(result.current.comments).toHaveLength(0);
  });

  it('no envía comentarios vacíos', async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextCursor: null });

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('   ');
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('remove borra de forma optimista', async () => {
    mockList.mockResolvedValueOnce({ rows: [comment('1'), comment('2')], nextCursor: null });
    mockCount.mockResolvedValueOnce(2);
    mockDelete.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('1');
    });

    expect(result.current.comments.map((c) => c.id)).toEqual(['2']);
    expect(result.current.total).toBe(1);
    expect(mockDelete).toHaveBeenCalledWith('1');
  });

  it('remove restaura el comentario si el borrado falla', async () => {
    mockList.mockResolvedValueOnce({ rows: [comment('1'), comment('2')], nextCursor: null });
    mockDelete.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('1');
    });

    expect(result.current.comments.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('loadMore pagina sin duplicados', async () => {
    mockList.mockResolvedValueOnce({
      rows: [comment('1')],
      nextCursor: { created_at: '2026-07-08T10:01:00Z', id: '1' },
    });

    const { result } = renderHook(() => useComments('p1', AUTHOR));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    // La segunda página devuelve '1' (duplicado) y '2' (nuevo)
    mockList.mockResolvedValueOnce({ rows: [comment('1'), comment('2')], nextCursor: null });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.comments.map((c) => c.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(false);
  });
});
