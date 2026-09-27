import { getMonday } from "@/lib/date";

export function nextMondayIso(): string {
  const monday = new Date(`${getMonday()}T00:00:00`);
  monday.setDate(monday.getDate() + 7);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export function shiftHours(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/Warsaw",
  "Europe/London",
];
