// Ventanas del ranking en Europe/Madrid (I-F-N08-02-01, #296).
//
// Los puntos se guardan en `user_points.awarded_at` como timestamptz (UTC) y la RPC
// `leaderboard` no hace ninguna conversión: es el cliente quien decide el rango. Se
// calcula contra Europe/Madrid de forma explícita —no contra la hora del dispositivo,
// como hace `lib/eventRange.ts`— porque el AC de F-N08-02 fija esa zona: un empleado
// que abra la app de viaje tiene que ver la misma semana que sus compañeros.
//
// Los rangos son half-open `[start, end)`. «Lunes 00:00 → domingo 23:59» se expresa
// pasando el lunes siguiente como fin exclusivo: no pierde el último segundo del
// domingo, cosa que sí haría un fin inclusivo a las 23:59:59.

const TIME_ZONE = 'Europe/Madrid';

export type DateRange = { start: Date; end: Date };

type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// hourCycle 'h23' evita que algunas implementaciones de ICU devuelvan "24" para
// la medianoche, que rompería la reconstrucción de la fecha.
const madridParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// Falla en alto si el motor no resuelve la zona: un runtime sin datos de ICU
// devolvería partes incompletas y, con un valor por defecto, el ranking mostraría
// una ventana silenciosamente equivocada en lugar de un error.
function requirePart(parts: Partial<Record<string, number>>, type: string): number {
  const value = parts[type];
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`Intl no resolvió la parte "${type}" para ${TIME_ZONE}`);
  }
  return value;
}

// Qué hora marca el reloj de pared de Madrid en un instante dado.
function wallClockIn(instant: Date): WallClock {
  const parts: Partial<Record<string, number>> = {};
  for (const part of madridParts.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: requirePart(parts, 'year'),
    month: requirePart(parts, 'month'),
    day: requirePart(parts, 'day'),
    hour: requirePart(parts, 'hour') % 24,
    minute: requirePart(parts, 'minute'),
    second: requirePart(parts, 'second'),
  };
}

// Instante UTC que corresponde a una hora de pared de Madrid. Se resuelve por
// iteración en vez de con una tabla de offsets: se parte de la lectura ingenua
// (como si Madrid fuese UTC), se mide el desfase real que produce y se corrige.
// Dos pasadas bastan porque la segunda solo tiene que absorber el caso en que la
// primera corrección cruce un cambio de hora.
function madridToUtc(wall: WallClock): Date {
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  let utc = target;

  for (let i = 0; i < 2; i += 1) {
    const seen = wallClockIn(new Date(utc));
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    );
    utc = target - (seenAsUtc - utc);
  }

  return new Date(utc);
}

// Medianoche de Madrid del día `dayOffset` respecto a la fecha de `wall`.
// El desplazamiento se hace sobre un Date en UTC solo para normalizar el
// desbordamiento de mes/año; la hora de pared resultante se reinterpreta después.
function midnightMadrid(wall: WallClock, dayOffset: number): Date {
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);

  return madridToUtc({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  });
}

// Semana natural: lunes 00:00 (inclusive) → lunes siguiente 00:00 (exclusivo).
export function currentWeekRangeMadrid(now: Date = new Date()): DateRange {
  const wall = wallClockIn(now);
  // getUTCDay() sobre la fecha civil de Madrid: 0 = domingo.
  const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return {
    start: midnightMadrid(wall, -daysSinceMonday),
    end: midnightMadrid(wall, -daysSinceMonday + 7),
  };
}

// Mes natural: día 1 a las 00:00 (inclusive) → día 1 del mes siguiente (exclusivo).
export function currentMonthRangeMadrid(now: Date = new Date()): DateRange {
  const wall = wallClockIn(now);
  const firstOfMonth: WallClock = { ...wall, day: 1, hour: 0, minute: 0, second: 0 };

  return {
    start: madridToUtc(firstOfMonth),
    end: madridToUtc({
      ...firstOfMonth,
      year: wall.month === 12 ? wall.year + 1 : wall.year,
      month: wall.month === 12 ? 1 : wall.month + 1,
    }),
  };
}
