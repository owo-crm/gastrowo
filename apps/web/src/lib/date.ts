export function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalIso(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function getMonday(dateInput = new Date()) {
  const date = new Date(dateInput);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return toLocalIso(date);
}

export function formatTime(timeValue: string) {
  return timeValue.slice(0, 5);
}

export function formatDate(dateValue: string) {
  return parseLocalIso(dateValue).toLocaleDateString();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatRelativeTimestamp(
  value: string,
  options: {
    todayLabel?: string;
    yesterdayLabel?: string;
    locale?: string;
  } = {},
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const locale = options.locale;
  const todayLabel = options.todayLabel ?? "today";
  const yesterdayLabel = options.yesterdayLabel ?? "yesterday";
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (dayDiff === 0) {
    return `${todayLabel} ${timeLabel}`;
  }
  if (dayDiff === 1) {
    return `${yesterdayLabel} ${timeLabel}`;
  }
  if (dayDiff >= 2 && dayDiff <= 6) {
    const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
    return `${weekdayLabel} ${timeLabel}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
