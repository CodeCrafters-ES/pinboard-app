import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatListRow } from '@/components/chat';
import type { MyChat } from '@/lib/chat';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function chat(over: Partial<MyChat> = {}): MyChat {
  return {
    chat_id: 'c1',
    is_group: false,
    last_message_at: '2026-08-06T10:00:00Z',
    last_read_at: '2026-08-06T09:00:00Z',
    unread_count: 0,
    partner_user_id: 'u2',
    partner_name: 'Ada Lovelace',
    partner_avatar_url: null,
    last_message_sender_id: 'u2',
    last_message_content: 'nos vemos',
    ...over,
  };
}

describe('ChatListRow', () => {
  it('muestra nombre y preview del interlocutor', () => {
    render(<ChatListRow chat={chat()} currentUserId="me" onPress={jest.fn()} />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('nos vemos')).toBeTruthy();
  });

  it('prefija "Tú:" cuando el último mensaje es mío', () => {
    render(
      <ChatListRow
        chat={chat({ last_message_sender_id: 'me' })}
        currentUserId="me"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Tú: nos vemos')).toBeTruthy();
  });

  it('muestra el badge solo si hay no leídos', () => {
    const { rerender } = render(
      <ChatListRow chat={chat({ unread_count: 4 })} currentUserId="me" onPress={jest.fn()} />,
    );
    expect(screen.getByText('4')).toBeTruthy();

    rerender(<ChatListRow chat={chat({ unread_count: 0 })} currentUserId="me" onPress={jest.fn()} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('indica cuando no hay mensajes', () => {
    render(
      <ChatListRow
        chat={chat({ last_message_sender_id: null, last_message_content: null })}
        currentUserId="me"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Sin mensajes aún')).toBeTruthy();
  });

  it('invoca onPress al pulsar', () => {
    const onPress = jest.fn();
    render(<ChatListRow chat={chat()} currentUserId="me" onPress={onPress} />);
    fireEvent.press(screen.getByText('Ada Lovelace'));
    expect(onPress).toHaveBeenCalled();
  });
});
