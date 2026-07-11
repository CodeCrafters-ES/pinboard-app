import { errorMessage, reportError } from '@/lib/errors';

// PostgrestError (supabase-js) es un objeto plano, no una subclase de Error: ese es
// justo el caso que antes se tragaba el mensaje real y dejaba solo el texto genérico.
const POSTGREST_ERROR = {
  message: 'column post_ratings_1.rating does not exist',
  code: '42703',
  details: null,
  hint: null,
};

describe('errorMessage', () => {
  it('reads the message from a real Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads the message from a plain Supabase error object', () => {
    expect(errorMessage(POSTGREST_ERROR)).toBe('column post_ratings_1.rating does not exist');
  });

  it('returns null when there is no usable message', () => {
    expect(errorMessage(null)).toBeNull();
    expect(errorMessage('boom')).toBeNull();
    expect(errorMessage({ code: '42703' })).toBeNull();
    expect(errorMessage(new Error(''))).toBeNull();
  });
});

describe('reportError', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => spy.mockClear());
  afterAll(() => spy.mockRestore());

  it('shows the user-facing message, never the database jargon', () => {
    expect(reportError('useFeed', POSTGREST_ERROR, 'No se pudieron cargar las noticias.')).toBe(
      'No se pudieron cargar las noticias.',
    );
  });

  it('logs the underlying error so the failure is diagnosable', () => {
    reportError('useFeed', POSTGREST_ERROR, 'No se pudieron cargar las noticias.');

    expect(spy).toHaveBeenCalledWith(
      '[useFeed] column post_ratings_1.rating does not exist',
      POSTGREST_ERROR,
    );
  });

  it('still logs when the error carries no message', () => {
    reportError('useFeed', {}, 'No se pudieron cargar las noticias.');

    expect(spy).toHaveBeenCalledWith('[useFeed] error desconocido', {});
  });
});
