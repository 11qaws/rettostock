// NYSE trading calendar — deterministic rules, no API needed.
//
// Substitute-holiday rules: a holiday on Saturday is observed the Friday
// before, on Sunday the Monday after. Exception: New Year's Day on a
// Saturday is simply not observed (NYSE rule — markets open Dec 31).
// Half days (13:00 ET early close): day after Thanksgiving, July 3 and
// Christmas Eve when they are weekdays and not themselves holidays.
//
// Ad-hoc closures (presidential mourning days, disasters) cannot be
// predicted by any calendar; the Finnhub isOpen backstop in useStockData
// covers those within minutes.

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Day of week for a calendar date (0=Sun..6=Sat), timezone-safe
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// Date of the n-th given weekday in a month (weekday 0=Sun..6=Sat)
const nthWeekday = (y, m, weekday, n) => {
  const first = dow(y, m, 1);
  return 1 + ((7 + weekday - first) % 7) + (n - 1) * 7;
};

const lastWeekday = (y, m, weekday) => {
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dow(y, m, daysInMonth);
  return daysInMonth - ((7 + last - weekday) % 7);
};

// Easter Sunday (anonymous Gregorian computus)
const easterSunday = (y) => {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
};

// Fixed-date holiday with Sat->Fri / Sun->Mon observation
const addObserved = (y, m, d, set) => {
  const w = dow(y, m, d);
  if (w === 6) set.add(key(y, m, d - 1));
  else if (w === 0) set.add(key(y, m, d + 1));
  else set.add(key(y, m, d));
};

const holidayCache = {};

export const getNyseHolidays = (y) => {
  if (holidayCache[y]) return holidayCache[y];
  const set = new Set();

  // New Year's Day — Sunday observed Monday; Saturday NOT observed
  {
    const w = dow(y, 1, 1);
    if (w === 0) set.add(key(y, 1, 2));
    else if (w !== 6) set.add(key(y, 1, 1));
  }
  set.add(key(y, 1, nthWeekday(y, 1, 1, 3)));    // MLK Day (3rd Mon Jan)
  set.add(key(y, 2, nthWeekday(y, 2, 1, 3)));    // Presidents' Day (3rd Mon Feb)
  {
    // Good Friday (Easter Sunday - 2 days; Date normalizes month underflow)
    const e = easterSunday(y);
    const gf = new Date(Date.UTC(y, e.month - 1, e.day - 2));
    set.add(key(gf.getUTCFullYear(), gf.getUTCMonth() + 1, gf.getUTCDate()));
  }
  set.add(key(y, 5, lastWeekday(y, 5, 1)));      // Memorial Day (last Mon May)
  if (y >= 2022) addObserved(y, 6, 19, set);     // Juneteenth (observed since 2022)
  addObserved(y, 7, 4, set);                     // Independence Day
  set.add(key(y, 9, nthWeekday(y, 9, 1, 1)));    // Labor Day (1st Mon Sep)
  set.add(key(y, 11, nthWeekday(y, 11, 4, 4)));  // Thanksgiving (4th Thu Nov)
  addObserved(y, 12, 25, set);                   // Christmas

  holidayCache[y] = set;
  return set;
};

const halfDayCache = {};

export const getNyseHalfDays = (y) => {
  if (halfDayCache[y]) return halfDayCache[y];
  const set = new Set();
  const holidays = getNyseHolidays(y);

  // July 3 — weekday and not an observed holiday itself
  {
    const w = dow(y, 7, 3);
    if (w >= 1 && w <= 5 && !holidays.has(key(y, 7, 3))) set.add(key(y, 7, 3));
  }
  // Day after Thanksgiving (always a Friday)
  set.add(key(y, 11, nthWeekday(y, 11, 4, 4) + 1));
  // Christmas Eve — weekday and not an observed holiday itself
  {
    const w = dow(y, 12, 24);
    if (w >= 1 && w <= 5 && !holidays.has(key(y, 12, 24))) set.add(key(y, 12, 24));
  }

  halfDayCache[y] = set;
  return set;
};

// Current NYSE session by the New York clock: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED'.
// Weekends, holidays (incl. observed substitutes) and 13:00 early closes
// are all handled here; returns null only on engines without timezone Intl.
export const calcNySession = (now = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: false,
    });
    const parts = formatter.formatToParts(now);
    let y = 0, mo = 0, d = 0, h = 0, mi = 0, weekday = '';
    for (const p of parts) {
      if (p.type === 'year') y = parseInt(p.value, 10);
      if (p.type === 'month') mo = parseInt(p.value, 10);
      if (p.type === 'day') d = parseInt(p.value, 10);
      if (p.type === 'hour') h = parseInt(p.value, 10);
      if (p.type === 'minute') mi = parseInt(p.value, 10);
      if (p.type === 'weekday') weekday = p.value;
    }
    if (h === 24) h = 0;

    if (weekday === 'Sat' || weekday === 'Sun') return 'CLOSED';
    const dateKey = key(y, mo, d);
    if (getNyseHolidays(y).has(dateKey)) return 'CLOSED';

    const half = getNyseHalfDays(y).has(dateKey);
    const t = h * 60 + mi;
    const regularEnd = half ? 780 : 960;   // 13:00 or 16:00
    const postEnd = half ? 1020 : 1200;    // 17:00 or 20:00

    if (t >= 240 && t < 570) return 'PRE';
    if (t >= 570 && t < regularEnd) return 'REGULAR';
    if (t >= regularEnd && t < postEnd) return 'POST';
    return 'CLOSED';
  } catch {
    return null; // very old CEF without Intl timezone support
  }
};

// Returns the current session and the upcoming session if a transition is within 5 minutes.
export const calcNySessionDetailed = (now = new Date()) => {
  const current = calcNySession(now);
  if (!current) return { current: null, upcoming: null };
  
  // Look 5 minutes into the future
  const future = new Date(now.getTime() + 5 * 60000);
  const nextSession = calcNySession(future);
  
  if (current !== nextSession) {
    return { current, upcoming: nextSession };
  }
  return { current, upcoming: null };
};
