// Tolerancia a clock-skew en el arranque de los tests de integración.
//
// Tras `supabase start`, hay una ventana transitoria en la que el `iat` del token
// recién emitido por GoTrue puede quedar por delante del reloj del validador
// (PostgREST), que rechaza el token con "JWT issued at future". Como Jest corre
// los suites en paralelo, cuál cae en esa ventana depende del timing.
//
// `withClockSkewRetry` reintenta solo ante ese error concreto; cualquier otro se
// propaga de inmediato para no enmascarar fallos reales.

const CLOCK_SKEW_RE = /issued at future/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isClockSkewError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
  return CLOCK_SKEW_RE.test(message);
}

export async function withClockSkewRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, delayMs = 1500 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isClockSkewError(err) || attempt === attempts) throw err;
      lastError = err;
      await sleep(delayMs);
    }
  }

  // Inaccesible (el bucle o devuelve o lanza), pero satisface el control de flujo.
  throw lastError;
}
