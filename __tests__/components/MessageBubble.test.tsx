import { Alert, type AlertButton } from 'react-native';
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

function renderBubble(props: Partial<React.ComponentProps<typeof MessageBubble>> = {}) {
  return render(
    <MessageBubble
      message={props.message ?? msg()}
      isOwn={props.isOwn ?? true}
      isAdmin={props.isAdmin ?? false}
      onRetry={props.onRetry ?? jest.fn()}
      onDelete={props.onDelete ?? jest.fn()}
    />,
  );
}

const DELETE_LABEL = 'Mantén pulsado para borrar';

describe('MessageBubble', () => {
  it('muestra el contenido del mensaje', () => {
    renderBubble();
    expect(screen.getByText('hola')).toBeTruthy();
  });

  it('enmascara los mensajes borrados', () => {
    renderBubble({ message: msg({ deleted_at: '2026-08-06T11:00:00Z' }) });
    expect(screen.getByText('Mensaje eliminado')).toBeTruthy();
    expect(screen.queryByText('hola')).toBeNull();
  });

  it('muestra "Enviando…" en estado pending', () => {
    renderBubble({ message: msg({ _status: 'pending' }) });
    expect(screen.getByText('Enviando…')).toBeTruthy();
  });

  it('permite reintentar un envío fallido', () => {
    const onRetry = jest.fn();
    renderBubble({ message: msg({ _status: 'failed', _clientId: 'temp-1' }), onRetry });
    fireEvent.press(screen.getByText('No enviado · Reintentar'));
    expect(onRetry).toHaveBeenCalledWith('temp-1');
  });

  it('long-press en un mensaje propio confirma y borra', () => {
    const onDelete = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const message = msg();
    renderBubble({ message, onDelete });

    fireEvent(screen.getByLabelText(DELETE_LABEL), 'longPress');

    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0]![2] as AlertButton[];
    const confirm = buttons.find((b) => b.style === 'destructive');
    expect(confirm?.text).toBe('Borrar');
    confirm?.onPress?.();
    expect(onDelete).toHaveBeenCalledWith(message);
    alertSpy.mockRestore();
  });

  it('un admin puede moderar un mensaje ajeno ("Borrar (moderación)")', () => {
    const onDelete = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const message = msg({ sender_id: 'other' });
    renderBubble({ message, isOwn: false, isAdmin: true, onDelete });

    fireEvent(screen.getByLabelText(DELETE_LABEL), 'longPress');
    const buttons = alertSpy.mock.calls[0]![2] as AlertButton[];
    expect(buttons.find((b) => b.style === 'destructive')?.text).toBe('Borrar (moderación)');
    alertSpy.mockRestore();
  });

  it('no ofrece borrar un mensaje ajeno si no eres admin', () => {
    renderBubble({ message: msg({ sender_id: 'other' }), isOwn: false, isAdmin: false });
    expect(screen.queryByLabelText(DELETE_LABEL)).toBeNull();
  });

  it('no ofrece borrar un mensaje ya borrado', () => {
    renderBubble({ message: msg({ deleted_at: '2026-08-06T11:00:00Z' }), isOwn: true });
    expect(screen.queryByLabelText(DELETE_LABEL)).toBeNull();
  });
});
