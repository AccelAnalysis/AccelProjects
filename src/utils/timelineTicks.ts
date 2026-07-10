import { addDays, daysBetween, formatDateOnly, parseDateOnly, toDateOnly } from "./dateOnly";
import type { ScheduleRange } from "./scheduleRange";

export type TimelineTick = {
  date: string;
  label: string;
  position: number;
};

function positionForDate(date: string, range: ScheduleRange) {
  return Math.max(0, Math.min(100, (daysBetween(range.startDate, date) / Math.max(range.totalDays, 1)) * 100));
}

function addUniqueTick(ticks: TimelineTick[], date: string, range: ScheduleRange, labelOptions?: Intl.DateTimeFormatOptions) {
  if (ticks.some((tick) => tick.date === date)) {
    return;
  }

  ticks.push({
    date,
    label: formatDateOnly(date, labelOptions),
    position: positionForDate(date, range)
  });
}

export function generateTimelineTicks(range: ScheduleRange): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const totalDays = Math.max(range.totalDays, 1);
  const stepDays = totalDays <= 21 ? 3 : totalDays <= 120 ? 7 : totalDays <= 365 ? 30 : 90;
  const labelOptions: Intl.DateTimeFormatOptions = totalDays > 120
    ? { month: "short", year: "numeric" }
    : { month: "short", day: "numeric" };

  addUniqueTick(ticks, range.startDate, range, labelOptions);

  for (let day = stepDays; day < totalDays; day += stepDays) {
    addUniqueTick(ticks, addDays(range.startDate, day), range, labelOptions);
  }

  const start = parseDateOnly(range.startDate);
  if (start && totalDays > 120) {
    const cursor = new Date(start);
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);

    while (toDateOnly(cursor) < range.endDate) {
      addUniqueTick(ticks, toDateOnly(cursor), range, labelOptions);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  addUniqueTick(ticks, range.endDate, range, labelOptions);
  return ticks.sort((left, right) => left.date.localeCompare(right.date));
}

export function timelinePercent(date: string, range: ScheduleRange) {
  return positionForDate(date, range);
}
