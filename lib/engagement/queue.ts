import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

// Cola FIFO persistente de eventos de engagement. Los heartbeats generados por
// usePostEngagement se encolan aquí y se entregan a la Edge Function track-engagement
// con reintentos, sobreviviendo a caídas de red y cierres de la app.

const QUEUE_KEY = '@engagement/queue';
const MAX_QUEUE_SIZE = 500;
const BATCH_SIZE = 50;
// Backoff exponencial con techo de 30s.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const FUNCTION_NAME = 'track-engagement';

export type EngagementPayload = {
  session_id: string;
  post_id: string;
  focused_seconds_delta: number;
  max_scroll_pct: number;
  client_ts: string;
};

function extra<T = string>(key: 'supabaseUrl' | 'supabaseAnonKey'): T | undefined {
  return Constants.expoConfig?.extra?.[key] as T | undefined;
}

function functionsUrl(): string {
  const base = extra('supabaseUrl');
  if (!base) throw new Error('supabaseUrl no está configurado en expoConfig.extra');
  return `${base}/functions/v1/${FUNCTION_NAME}`;
}

async function readQueue(): Promise<EngagementPayload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EngagementPayload[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: EngagementPayload[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function size(): Promise<number> {
  return (await readQueue()).length;
}

export async function enqueue(payload: EngagementPayload): Promise<void> {
  const queue = await readQueue();
  queue.push(payload);

  if (queue.length > MAX_QUEUE_SIZE) {
    const dropped_count = queue.length - MAX_QUEUE_SIZE;
    queue.splice(0, dropped_count); // descarta los más antiguos (FIFO)
    console.warn(`[engagement] cola llena: descartados ${dropped_count} eventos antiguos`, {
      dropped_count,
    });
  }

  await writeQueue(queue);
  // Best-effort: no bloquear al productor esperando la red.
  void flush();
}

// ─── Envío HTTP ───────────────────────────────────────────────────────────────

type SendResult = 'ok' | 'retry' | 'drop';

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postBatch(batch: EngagementPayload[], token: string | null): Promise<Response> {
  return fetch(functionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: extra('supabaseAnonKey') ?? '',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(batch),
  });
}

function classify(res: Response): SendResult {
  if (res.ok) return 'ok';
  // 5xx y demás: transitorio, reintenta con backoff.
  if (res.status >= 500) return 'retry';
  // 4xx (no-401): el servidor rechaza el payload de forma permanente → descartar
  // para no bloquear la cola en un bucle infinito.
  return 'drop';
}

async function sendBatch(batch: EngagementPayload[]): Promise<SendResult> {
  let res: Response;
  try {
    res = await postBatch(batch, await accessToken());
  } catch {
    return 'retry'; // error de red
  }

  // 401: refresca la sesión Supabase y reintenta una sola vez.
  if (res.status === 401) {
    await supabase.auth.refreshSession();
    try {
      res = await postBatch(batch, await accessToken());
    } catch {
      return 'retry';
    }
    if (res.status === 401) return 'retry'; // auth aún no disponible: transitorio
  }

  return classify(res);
}

// ─── Flush + backoff ────────────────────────────────────────────────────────

let isFlushing = false;
let backoffIndex = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(): void {
  if (retryTimer) return;
  const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)]!;
  backoffIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, delay);
}

function resetBackoff(): void {
  backoffIndex = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export async function flush(): Promise<void> {
  if (isFlushing) return; // evita drenajes concurrentes
  isFlushing = true;
  try {
    let queue = await readQueue();
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH_SIZE);
      const result = await sendBatch(batch);

      if (result === 'retry') {
        scheduleRetry();
        return; // mantiene el lote en cola para el próximo intento
      }

      if (result === 'ok') backoffIndex = 0; // se resetea al primer éxito
      queue = queue.slice(batch.length); // quita el lote del frente (ok o drop)
      await writeQueue(queue);
    }
    resetBackoff();
  } finally {
    isFlushing = false;
  }
}
