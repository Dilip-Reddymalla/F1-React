// UTC-correct helpers: Ergast/Jolpi emits date "YYYY-MM-DD" and time "HH:mm:ssZ" (UTC).
// We normalize by ensuring a trailing Z so Date parses as UTC, then format with Intl.

export function parseRaceUTC(date, time) {
  if (!date) return null;
  const t = (time || '00:00:00').trim();
  const iso = t.endsWith('Z') ? `${date}T${t}` : `${date}T${t}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateUTC(date, time, opts = {}) {
  const d = parseRaceUTC(date, time);
  if (!d) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...opts,
  }).format(d);
}

export function formatTimeUTC(date, time) {
  const d = parseRaceUTC(date, time);
  if (!d) return 'TBD';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(d);
}

export function formatInTimezone(date, time, timeZone) {
  const d = parseRaceUTC(date, time);
  if (!d) return 'TBD';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return formatTimeUTC(date, time);
  }
}

export function getRaceStatus(date, time) {
  const start = parseRaceUTC(date, time);
  if (!start) return 'TBD';
  const now = Date.now();
  const ms = start.getTime() - now;
  const twoHours = 2 * 60 * 60 * 1000;
  if (ms < -twoHours) return 'DONE';
  if (ms <= 0 && ms > -twoHours) return 'LIVE';
  if (ms > 0 && ms < 7 * 24 * 60 * 60 * 1000) return 'NEXT';
  return 'UPCOMING';
}

export function countdownParts(targetDate) {
  const d = targetDate instanceof Date ? targetDate : parseRaceUTC(targetDate?.date, targetDate?.time);
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { over: true, d: 0, h: 0, m: 0, s: 0 };
  const s = Math.floor(diff / 1000);
  return {
    over: false,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
