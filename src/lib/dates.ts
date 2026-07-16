const italianTimeZone = "Europe/Rome";

export function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: italianTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function todayKey() {
  return dateKey();
}

export function formatItalianDate(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function currentTime() {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: italianTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function getBookingWindowStatus(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: italianTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const today = `${values.year}-${values.month}-${values.day}`;
  const weekday = dayOfWeekKey(today);

  if (minutes >= 14 * 60) {
    const entryDate = nextOpenLunchDate(today, 1);
    return {
      isOpen: true,
      entryDate,
      message: `Prenotazione aperta per il pranzo di ${formatDateKeyForMessage(entryDate)}.`,
    };
  }

  if (minutes <= 10 * 60 + 45 && isOpenLunchWeekday(weekday)) {
    return {
      isOpen: true,
      entryDate: today,
      message: "Prenotazione aperta per il pranzo di oggi.",
    };
  }

  if (!isOpenLunchWeekday(weekday)) {
    const entryDate = nextOpenLunchDate(today, 0);
    return {
      isOpen: true,
      entryDate,
      message: `Prenotazione aperta per il pranzo di ${formatDateKeyForMessage(entryDate)}.`,
    };
  }

  return {
    isOpen: false,
    entryDate: null,
    message: "Prenotazioni chiuse, chiama dopo le 14.00",
  };
}

function addDaysKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function dayOfWeekKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function isOpenLunchWeekday(weekday: number) {
  return weekday >= 2 && weekday <= 5;
}

function nextOpenLunchDate(key: string, minimumDaysAhead: number) {
  for (let offset = minimumDaysAhead; offset <= minimumDaysAhead + 7; offset += 1) {
    const candidate = addDaysKey(key, offset);
    if (isOpenLunchWeekday(dayOfWeekKey(candidate))) return candidate;
  }

  return addDaysKey(key, minimumDaysAhead);
}

function formatDateKeyForMessage(key: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${key}T00:00:00`));
}
