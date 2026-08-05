import { fireEvent, render, screen } from '@testing-library/react-native';

import { MessageBubble } from '@/components/chat';
import type { ChatMessage } from '@/lib/chat';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    chat_id: 'c1',
    sender_id: 'me',
    content: 'hola',
    created_at: '2026-08-06T10:00:00Z',
    edited_at: null,
    deleted_at: null,
    ...over,
  };
}

describe('MessageBubble', () => {
  it('muestra el contenido del mensaje', () => {
    render(<MessageBubble message={msg()} isOwn onRetry={jest.fn()} />);
    expect(screen.getByText('hola')).toBeTruthy();
  });

  it('enmascara los mensajes borrados', () => {
    render(<MessageBubble message={msg({ deleted_at: '2026-08-06T11:00:00Z' })} isOwn onRetry={jest.fn()} />);
    expect(screen.getByText('Mensaje eliminado')).toBeTruthy();
    expect(screen.queryByText('hola')).toBeNull();
  });

  it('muestra "Enviando…" en estado pending', () => {
    render(<MessageBubble message={msg({ _status: 'pending' })} isOwn onRetry={jest.fn()} />);
    expect(screen.getByText('Enviando…')).toBeTruthy();
  });

  it('permite reintentar un envío fallido', () => {
    const onRetry = jest.fn();
    render(
      <MessageBubble
        message={msg({ _status: 'failed', _clientId: 'temp-1' })}
        isOwn
        onRetry={onRetry}
      />,
    );
    fireEvent.press(screen.getByText('No enviado · Reintentar'));
    expect(onRetry).toHaveBeenCalledWith('temp-1');
  });
});
