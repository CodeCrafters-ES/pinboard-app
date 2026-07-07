import { useState, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
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

function isValidUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

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
  const [isScraping, setIsScraping] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [scrapeBanner, setScrapeBanner] = useState<string | null>(null);

  const titleTouched      = useRef(Boolean(initialValues?.title));
  const subtitleTouched   = useRef(Boolean(initialValues?.subtitle));
  const imageTouched      = useRef(false);
  const scrapeTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showScrapeBanner(msg: string) {
    if (scrapeBannerTimer.current) clearTimeout(scrapeBannerTimer.current);
    setScrapeBanner(msg);
    scrapeBannerTimer.current = setTimeout(() => setScrapeBanner(null), 4000);
  }

  async function scrapeUrl(url: string) {
    if (!isValidUrl(url)) return;
    setIsScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-og', { body: { url } });
      if (error) {
        if (error instanceof FunctionsHttpError && error.context.status >= 500) {
          showScrapeBanner('No se pudo obtener la preview del enlace');
        }
        return;
      }
      if (data) {
        if (!titleTouched.current && data.title)          setTitle(data.title);
        if (!subtitleTouched.current && data.description) setSubtitle(data.description);
        if (!imageTouched.current && data.image)          setCoverImageUrl(data.image);
      }
    } finally {
      setIsScraping(false);
    }
  }

  function handleUrlChange(text: string) {
    setExternalUrl(text);
    if (scrapeTimer.current) clearTimeout(scrapeTimer.current);
    scrapeTimer.current = setTimeout(() => scrapeUrl(text), 600);
  }

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
    <View className="flex-1 bg-nun-linen">
      {scrapeBanner ? (
        <View className="px-4 py-2 bg-nun-error">
          <Text className="text-white text-sm text-center">{scrapeBanner}</Text>
        </View>
      ) : null}
      <ScrollView
        className="flex-1"
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
          onChangeText={(v) => { titleTouched.current = true; setTitle(v); }}
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
          onChangeText={(v) => { subtitleTouched.current = true; setSubtitle(v); }}
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
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            URL externa *
          </Text>
          {isScraping && <ActivityIndicator size="small" color="#8C7B6A" />}
        </View>
        <TextInput
          className={INPUT_CLASS}
          value={externalUrl}
          onChangeText={handleUrlChange}
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

      {/* Portada */}
      <View className="gap-1">
        <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
          Imagen de portada
        </Text>
        {coverImageUrl ? (
          <View className="gap-1.5">
            <Image
              source={{ uri: coverImageUrl }}
              contentFit="cover"
              className="w-full h-32 rounded-xl"
              accessibilityLabel="Imagen de portada"
            />
            <Text className="text-xs text-nun-muted" numberOfLines={1}>
              {coverImageUrl}
            </Text>
          </View>
        ) : (
          <View className="bg-nun-sand border border-dashed border-nun-parchment rounded-xl px-4 py-6 items-center">
            <Text className="text-xs text-nun-muted">Subida de imagen — próximamente</Text>
          </View>
        )}
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
    </View>
  );
}
