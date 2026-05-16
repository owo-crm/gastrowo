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
