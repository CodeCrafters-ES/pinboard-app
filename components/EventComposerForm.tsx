import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { eventSchema, type EventFormData } from '@/lib/validation/eventSchema';
import { EVENT_COLORS, EVENT_COLOR_META, type EventColor } from '@/lib/eventColors';
import { useEventImageUpload } from '@/hooks/useEventImageUpload';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

type Props = {
  authorId: string;
  initialValues?: Partial<EventFormData>;
  onSubmit: (data: EventFormData) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
  saving: boolean;
};

type FieldErrors = Partial<Record<keyof EventFormData, string>>;

const INPUT_CLASS =
  'bg-white border border-nun-parchment rounded-xl px-4 py-3 text-[15px] text-nun-dark';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// ── Conversión ISO ↔ inputs locales de fecha/hora ────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoToDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoToTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combina fecha (YYYY-MM-DD) + hora (HH:MM) en ISO UTC. Devuelve null si el
// formato no es válido. endOfDay fuerza 23:59:59.999 para eventos de día completo.
function combine(dateStr: string, timeStr: string, endOfDay = false): string | null {
  if (!DATE_RE.test(dateStr)) return null;
  if (!endOfDay && !TIME_RE.test(timeStr)) return null;

  const dateParts = dateStr.split('-');
  const y = Number(dateParts[0]);
  const mo = Number(dateParts[1]);
  const d = Number(dateParts[2]);

  const timeParts = timeStr.split(':');
  const h = endOfDay ? 23 : Number(timeParts[0]);
  const mi = endOfDay ? 59 : Number(timeParts[1]);
  const s = endOfDay ? 59 : 0;
  const ms = endOfDay ? 999 : 0;

  const local = new Date(y, mo - 1, d, h, mi, s, ms);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function EventComposerForm({
  authorId,
  initialValues,
  onSubmit,
  onDelete,
  submitLabel,
  saving,
}: Props) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [location, setLocation] = useState(initialValues?.location ?? '');
  const [allDay, setAllDay] = useState(initialValues?.all_day ?? false);
  const [colorTag, setColorTag] = useState<EventColor>(initialValues?.color_tag ?? 'brown');

  const [startDate, setStartDate] = useState(isoToDate(initialValues?.event_start_at));
  const [startTime, setStartTime] = useState(isoToTime(initialValues?.event_start_at));
  const [endDate, setEndDate] = useState(isoToDate(initialValues?.event_end_at));
  const [endTime, setEndTime] = useState(isoToTime(initialValues?.event_end_at));

  const [imageUrl, setImageUrl] = useState<string | null>(initialValues?.image_url ?? null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});

  const { pickAndUpload, isUploading } = useEventImageUpload(authorId);

  async function handlePickImage() {
    setImageError(null);
    try {
      const result = await pickAndUpload();
      if (result) {
        setImageUrl(result.path);
        setPreviewUri(result.previewUri);
      }
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'No se pudo subir la imagen');
    }
  }

  function handleSubmit() {
    // Con all_day el input de hora está oculto: el inicio se normaliza a 00:00 y
    // el fin a 23:59:59.999 (endOfDay), consistente con el AC de I-F-N05-01-02.
    const startIso = combine(startDate, allDay ? '00:00' : startTime);
    const endIso = combine(endDate, allDay ? '00:00' : endTime, allDay);

    const fieldErrors: FieldErrors = {};
    if (!startIso) fieldErrors.event_start_at = 'Fecha/hora de inicio no válida';
    if (!endIso) fieldErrors.event_end_at = 'Fecha/hora de fin no válida';
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    const result = eventSchema.safeParse({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      all_day: allDay,
      event_start_at: startIso,
      event_end_at: endIso,
      color_tag: colorTag,
      image_url: imageUrl,
    });

    if (!result.success) {
      const zodErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof EventFormData;
        if (!zodErrors[key]) zodErrors[key] = issue.message;
      }
      setErrors(zodErrors);
      return;
    }

    setErrors({});
    void onSubmit(result.data);
  }

  return (
    <View className="flex-1 bg-nun-linen">
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
            onChangeText={setTitle}
            placeholder="Título del evento…"
            placeholderTextColor="#8C7B6A"
            maxLength={200}
            autoCapitalize="sentences"
          />
          {errors.title ? <Text className="text-xs text-nun-error">{errors.title}</Text> : null}
        </View>

        {/* Descripción */}
        <View className="gap-1">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Descripción (opcional)
          </Text>
          <TextInput
            className={`${INPUT_CLASS} min-h-[100px]`}
            value={description}
            onChangeText={setDescription}
            placeholder="Detalles del evento…"
            placeholderTextColor="#8C7B6A"
            multiline
            textAlignVertical="top"
            maxLength={5000}
            autoCapitalize="sentences"
          />
          {errors.description ? (
            <Text className="text-xs text-nun-error">{errors.description}</Text>
          ) : null}
        </View>

        {/* Ubicación */}
        <View className="gap-1">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Ubicación (opcional)
          </Text>
          <TextInput
            className={INPUT_CLASS}
            value={location}
            onChangeText={setLocation}
            placeholder="Lugar…"
            placeholderTextColor="#8C7B6A"
            maxLength={200}
            autoCapitalize="sentences"
          />
          {errors.location ? (
            <Text className="text-xs text-nun-error">{errors.location}</Text>
          ) : null}
        </View>

        {/* Día completo */}
        <View className="flex-row items-center justify-between bg-white border border-nun-parchment rounded-xl px-4 py-3">
          <Text className="text-[15px] text-nun-dark">Todo el día</Text>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ true: '#7D5A3A', false: '#E2D4BC' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Todo el día"
          />
        </View>

        {/* Inicio */}
        <View className="gap-1">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Inicio *
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              className={`${INPUT_CLASS} flex-1`}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#8C7B6A"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!allDay ? (
              <TextInput
                className={`${INPUT_CLASS} w-24`}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:MM"
                placeholderTextColor="#8C7B6A"
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
          </View>
          {errors.event_start_at ? (
            <Text className="text-xs text-nun-error">{errors.event_start_at}</Text>
          ) : null}
        </View>

        {/* Fin */}
        <View className="gap-1">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Fin *
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              className={`${INPUT_CLASS} flex-1`}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#8C7B6A"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!allDay ? (
              <TextInput
                className={`${INPUT_CLASS} w-24`}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="HH:MM"
                placeholderTextColor="#8C7B6A"
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
          </View>
          {errors.event_end_at ? (
            <Text className="text-xs text-nun-error">{errors.event_end_at}</Text>
          ) : null}
        </View>

        {/* Color */}
        <View className="gap-2">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Color
          </Text>
          <View className="flex-row gap-3">
            {EVENT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColorTag(c)}
                accessibilityRole="radio"
                accessibilityState={{ checked: colorTag === c }}
                accessibilityLabel={EVENT_COLOR_META[c].label}
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  colorTag === c ? 'border-2 border-nun-dark' : 'border border-nun-parchment'
                }`}
              >
                <View
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR_META[c].hex }}
                />
              </Pressable>
            ))}
          </View>
          <Text className="text-xs text-nun-muted">{EVENT_COLOR_META[colorTag].label}</Text>
        </View>

        {/* Imagen */}
        <View className="gap-1">
          <Text className="text-xs font-semibold text-nun-muted uppercase tracking-wide">
            Imagen (opcional)
          </Text>
          {previewUri || imageUrl ? (
            <View className="gap-1.5">
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  contentFit="cover"
                  className="w-full h-32 rounded-xl"
                  accessibilityLabel="Imagen del evento"
                />
              ) : (
                <View className="bg-nun-sand border border-nun-parchment rounded-xl px-4 py-6 items-center">
                  <Text className="text-xs text-nun-muted">Imagen adjunta</Text>
                </View>
              )}
              <Pressable
                onPress={() => {
                  setImageUrl(null);
                  setPreviewUri(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Quitar imagen"
              >
                <Text className="text-xs text-nun-error">Quitar imagen</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handlePickImage}
              disabled={isUploading}
              accessibilityRole="button"
              accessibilityLabel="Subir imagen"
              className="bg-nun-sand border border-dashed border-nun-parchment rounded-xl px-4 py-6 items-center active:opacity-70"
            >
              {isUploading ? (
                <ActivityIndicator color="#7D5A3A" />
              ) : (
                <Text className="text-xs text-nun-muted">Toca para subir una imagen</Text>
              )}
            </Pressable>
          )}
          {imageError ? <Text className="text-xs text-nun-error">{imageError}</Text> : null}
        </View>

        {/* Acciones */}
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
            <Button label="Eliminar evento" variant="danger" onPress={onDelete} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
