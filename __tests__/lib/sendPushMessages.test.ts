import {
  BODY_MAX_CHARS,
  chatMessage,
  eventMessage,
  formatEventDate,
  postMessage,
  truncate,
} from '../../supabase/functions/send-push/messages';

// Composición del copy de las notificaciones (I-F-N06-02-02). El módulo es puro, así
// que se ejercita directamente sin levantar la Edge Function.

describe('truncate', () => {
  it('deja intacto un texto por debajo del límite', () => {
    expect(truncate('Nueva carta de temporada')).toBe('Nueva carta de temporada');
  });

  it('recorta al límite incluyendo la elipsis', () => {
    const long = 'a'.repeat(200);

    const result = truncate(long);

    expect(result).toHaveLength(BODY_MAX_CHARS);
    expect(result.endsWith('…')).toBe(true);
  });

  it('quita los espacios sobrantes', () => {
    expect(truncate('  Briefing  ')).toBe('Briefing');
  });
});

describe('formatEventDate', () => {
  // 2026-07-24T15:00:00Z = 17:00 en Madrid (CEST, +02:00).
  it('formatea en Europe/Madrid, no en UTC', () => {
    expect(formatEventDate('2026-07-24T15:00:00Z')).toBe('vie 24 jul, 17:00');
  });

  // En invierno el desfase es de una hora: comprueba que se usa la zona y no un offset fijo.
  it('respeta el cambio de hora', () => {
    expect(formatEventDate('2026-01-09T16:30:00Z')).toBe('vie 9 ene, 17:30');
  });

  it('devuelve cadena vacía ante una fecha inválida', () => {
    expect(formatEventDate('no-es-una-fecha')).toBe('');
  });
});

describe('postMessage', () => {
  const record = { id: '11111111-1111-1111-1111-111111111111', title: 'Nueva carta de temporada' };

  it('usa el copy acordado y el payload de ADR-003', () => {
    expect(postMessage(record)).toEqual({
      title: 'Nuevo post',
      body: 'Nueva carta de temporada',
      data: { type: 'post', id: record.id },
      channelId: 'general',
      priority: 'default',
    });
  });

  it('recorta el cuerpo a 120 caracteres', () => {
    const message = postMessage({ ...record, title: 'x'.repeat(300) });

    expect(message.body).toHaveLength(BODY_MAX_CHARS);
  });

  it('cae en un texto por defecto si el título viene vacío', () => {
    expect(postMessage({ ...record, title: '   ' }).body).toBe('Nuevo contenido en el tablón');
  });
});

describe('eventMessage', () => {
  const record = {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Briefing de sala',
    event_start_at: '2026-07-24T15:00:00Z',
  };

  it('añade la fecha localizada al cuerpo', () => {
    expect(eventMessage(record)).toEqual({
      title: 'Nuevo evento',
      body: 'Briefing de sala · vie 24 jul, 17:00',
      data: { type: 'event', id: record.id },
      channelId: 'general',
      priority: 'default',
    });
  });

  // La fecha es lo que no se puede perder: se recorta el título para dejarle sitio.
  it('mantiene la fecha aunque el título sea larguísimo', () => {
    const message = eventMessage({ ...record, title: 'x'.repeat(300) });

    expect(message.body.endsWith('· vie 24 jul, 17:00')).toBe(true);
    expect(message.body.length).toBeLessThanOrEqual(BODY_MAX_CHARS);
  });

  it('omite el separador si la fecha no es válida', () => {
    const message = eventMessage({ ...record, event_start_at: 'nope' });

    expect(message.body).toBe('Briefing de sala');
  });
});

describe('chatMessage', () => {
  const record = { chat_id: '33333333-3333-3333-3333-333333333333', content: 'Nos vemos a las 8' };

  it('usa el nombre del remitente y el payload de chat de ADR-003', () => {
    expect(chatMessage(record, 'Marta Ferrer')).toEqual({
      title: 'Marta Ferrer',
      body: 'Nos vemos a las 8',
      data: { type: 'chat', id: record.chat_id },
      channelId: 'chat',
      priority: 'high',
    });
  });

  it('cae en un título genérico si no hay nombre de remitente', () => {
    expect(chatMessage(record, null).title).toBe('Nuevo mensaje');
    expect(chatMessage(record, '   ').title).toBe('Nuevo mensaje');
  });

  it('recorta el cuerpo a 80 caracteres incluyendo la elipsis', () => {
    const message = chatMessage({ ...record, content: 'a'.repeat(200) }, 'Marta');

    expect(message.body).toHaveLength(80);
    expect(message.body.endsWith('…')).toBe(true);
  });

  it('el deep-link apunta al chat, no al mensaje', () => {
    expect(chatMessage(record, 'Marta').data).toEqual({ type: 'chat', id: record.chat_id });
  });
});
