import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { MAX_COMMENT_LENGTH } from '@/lib/comments';

type Props = {
  onSubmit: (body: string) => void;
  submitting?: boolean;
};

export function CommentComposer({ onSubmit, submitting }: Props) {
  const [body, setBody] = useState('');
  const trimmed = body.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_COMMENT_LENGTH && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setBody('');
    Keyboard.dismiss();
  }

  return (
    <View className="gap-2">
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Escribe un comentario…"
        placeholderTextColor="#8C7B6A"
        multiline
        maxLength={MAX_COMMENT_LENGTH}
        accessibilityLabel="Nuevo comentario"
        className="min-h-[44px] rounded-xl border border-nun-parchment bg-nun-white px-3 py-2 text-[15px] text-nun-dark"
        style={{ textAlignVertical: 'top' }}
      />
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-nun-muted">
          {body.length}/{MAX_COMMENT_LENGTH}
        </Text>
        <Button
          label="Comentar"
          variant="primary"
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={canSubmit ? '' : 'opacity-50'}
        />
      </View>
    </View>
  );
}
