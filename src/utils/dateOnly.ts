const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string | null | undefined): value is string {
  if (!value || !dateOnlyPattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  return isDateOnly(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function todayDateOnly(now = new Date()) {
  return toDateOnly(now);
}

export function addDays(dateOnly: string, days: number) {
  const date = parseDateOnly(dateOnly);

  if (!date) {
    return todayDateOnly();
  }

  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

export function addMonths(dateOnly: string, months: number) {
  const date = parseDateOnly(dateOnly);

  if (!date) {
    return todayDateOnly();
  }

  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const month = date.getUTCMonth();
  date.setUTCDate(originalDay);

  if (date.getUTCMonth() !== month) {
    date.setUTCDate(0);
  }

  return toDateOnly(date);
}

export function daysBetween(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return 0;
  }

  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function formatDateOnly(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = parseDateOnly(value);

  if (!date) {
    return "Date unavailable";
  }

  return date.toLocaleDateString(undefined, { timeZone: "UTC", ...options });
}

export function compareDateOnly(left: string | null | undefined, right: string | null | undefined) {
  if (!isDateOnly(left) && !isDateOnly(right)) {
    return 0;
  }

  if (!isDateOnly(left)) {
    return 1;
  }

  if (!isDateOnly(right)) {
    return -1;
  }

  return left.localeCompare(right);
}

export function clampDateOnly(value: string, startDate: string, endDate: string) {
  if (value < startDate) {
    return startDate;
  }

  if (value > endDate) {
    return endDate;
  }

  return value;
}
