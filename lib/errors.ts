// Los errores de Supabase no son homogéneos: AuthError, StorageError y FunctionsError
// extienden Error, pero PostgrestError es un objeto plano { message, code, details, hint }.
// Por eso `e instanceof Error` da false ante cualquier fallo de una query y el mensaje real
// se perdía: la UI enseñaba solo el texto genérico y no quedaba rastro en ningún sitio.

export function errorMessage(e: unknown): string | null {
  if (e instanceof Error && e.message) return e.message;

  if (typeof e === 'object' && e !== null && 'message' in e) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return null;
}

// Deja el error real en los logs (dev y crash reporting) y devuelve el texto que ve el
// usuario, que nunca es jerga técnica de Postgres.
export function reportError(context: string, e: unknown, userMessage: string): string {
  console.error(`[${context}] ${errorMessage(e) ?? 'error desconocido'}`, e);
  return userMessage;
}
