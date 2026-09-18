import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';

import { MAX_MESSAGE_LENGTH } from '@/lib/chat';

type Props = {
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
};

// Input de redacción + botón enviar. Notifica el typing al padre (que gestiona el
// debounce vía useTyping) y limpia el campo al enviar.
export function ChatComposer({ onSend, onTyping, disabled }: Props) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  function handleChange(value: string) {
    setText(value);
    onTyping?.(value.trim().length > 0);
  }

  function handleSend() {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
    onTyping?.(false);
  }

  return (
    <View className="flex-row items-end gap-2 px-3 py-2 border-t border-nun-parchment bg-nun-linen">
      <TextInput
        value={text}
        onChangeText={handleChange}
        placeholder="Escribe un mensaje…"
        placeholderTextColor="#8C7B6A"
        multiline
        maxLength={MAX_MESSAGE_LENGTH}
        className="flex-1 max-h-28 bg-white rounded-2xl px-4 py-2.5 text-[15px] text-nun-dark"
        accessibilityLabel="Mensaje"
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Enviar"
        className={`w-11 h-11 rounded-full items-center justify-center ${
          canSend ? 'bg-nun-brown active:opacity-70' : 'bg-nun-parchment'
        }`}
      >
        <Send size={20} color={canSend ? '#FFFFFF' : '#8C7B6A'} />
      </Pressable>
    </View>
  );
}
