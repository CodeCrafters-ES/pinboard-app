import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { postSchema, type PostFormData } from '@/lib/validation/postSchema';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

type Props = {
  initialValues?: Partial<PostFormData>;
  onSubmit: (data: PostFormData) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
  saving: boolean;
};

type FieldErrors = Partial<Record<keyof PostFormData, string>>;

const INPUT_CLASS =
  'bg-white border border-nun-parchment rounded-xl px-4 py-3 text-[15px] text-nun-dark';

export function PostComposerForm({
  initialValues,
  onSubmit,
  onDelete,
  submitLabel,
  saving,
}: Props) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [subtitle, setSubtitle] = useState(initialValues?.subtitle ?? '');
  const [externalUrl, setExternalUrl] = useState(initialValues?.external_url ?? '');
  const [body, setBody] = useState(initialValues?.body ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(
    initialValues?.status ?? 'draft',
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit() {
    const result = postSchema.safeParse({
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      external_url: externalUrl.trim(),
      body: body.trim() || undefined,
      status,
    });

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PostFormData;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await onSubmit(result.data);
  }

  return (
    <ScrollView
      className="flex-1 bg-nun-linen"
      contentContainerClassName="px-4 py-4 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      {/* Título */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Título *
        </Text>
        <TextInput
          className={INPUT_CLASS}
          value={title}
          onChangeText={setTitle}
          placeholder="Título del post…"
          placeholderTextColor="#8C7B6A"
          maxLength={200}
          autoCapitalize="sentences"
        />
        {errors.title ? (
          <Text className="text-xs text-nun-error">{errors.title}</Text>
        ) : null}
      </View>

      {/* Subtítulo */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Subtítulo (opcional)
        </Text>
        <TextInput
          className={INPUT_CLASS}
          value={subtitle}
          onChangeText={setSubtitle}
          placeholder="Subtítulo…"
          placeholderTextColor="#8C7B6A"
          maxLength={200}
          autoCapitalize="sentences"
        />
        {errors.subtitle ? (
          <Text className="text-xs text-nun-error">{errors.subtitle}</Text>
        ) : null}
      </View>

      {/* URL externa */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          URL externa *
        </Text>
        <TextInput
          className={INPUT_CLASS}
          value={externalUrl}
          onChangeText={setExternalUrl}
          placeholder="https://…"
          placeholderTextColor="#8C7B6A"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.external_url ? (
          <Text className="text-xs text-nun-error">{errors.external_url}</Text>
        ) : null}
      </View>

      {/* Portada (placeholder) */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Imagen de portada
        </Text>
        <View className="bg-nun-sand border border-dashed border-nun-parchment rounded-xl px-4 py-6 items-center">
          <Text className="text-xs text-nun-muted">Subida de imagen — próximamente</Text>
        </View>
      </View>

      {/* Cuerpo */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Cuerpo (opcional · Markdown)
        </Text>
        <TextInput
          className={`${INPUT_CLASS} min-h-[120px]`}
          value={body}
          onChangeText={setBody}
          placeholder="Contenido en Markdown…"
          placeholderTextColor="#8C7B6A"
          multiline
          textAlignVertical="top"
          maxLength={20000}
          autoCapitalize="sentences"
        />
        <Text className="text-xs text-nun-muted self-end">{body.length} / 20.000</Text>
        {errors.body ? (
          <Text className="text-xs text-nun-error">{errors.body}</Text>
        ) : null}
      </View>

      {/* Estado */}
      <View className="gap-2">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Estado
        </Text>
        <View className="flex-row gap-2">
          {(['draft', 'published'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              accessibilityRole="radio"
              accessibilityState={{ checked: status === s }}
              className={`flex-1 rounded-xl py-3 items-center ${
                status === s ? 'bg-nun-brown' : 'bg-nun-sand border border-nun-parchment'
              }`}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  status === s ? 'text-white' : 'text-nun-dark'
                }`}
              >
                {s === 'draft' ? 'Borrador' : 'Publicado'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Botones de acción */}
      <View className="gap-3 mt-2">
        <Pressable
          onPress={handleSubmit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          className={`rounded-xl py-3 items-center justify-center bg-nun-brown active:opacity-80 ${saving ? 'opacity-50' : ''}`}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-[15px] font-semibold">{submitLabel}</Text>
          )}
        </Pressable>

        {onDelete ? (
          <Button label="Eliminar post" variant="danger" onPress={onDelete} />
        ) : null}
      </View>
    </ScrollView>
  );
}
