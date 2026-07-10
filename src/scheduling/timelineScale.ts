import type { ScheduleRange } from "../utils/scheduleRange";
import { addDays, addMonths, daysBetween, formatDateOnly, parseDateOnly, toDateOnly } from "../utils/dateOnly";

export type TimelineZoomMode = "day" | "week" | "month" | "quarter" | "fit";

export type TimelineScale = {
  mode: TimelineZoomMode;
  pixelsPerDay: number;
  timelineWidth: number;
  visibleStartDate: string;
  visibleEndDate: string;
};

export type TimelineHeaderTick = {
  date: string;
  label: string;
  positionPx: number;
  level: "major" | "minor";
};

const zoomPixelsPerDay: Record<Exclude<TimelineZoomMode, "fit">, number> = {
  day: 36,
  week: 14,
  month: 4.5,
  quarter: 1.6
};

export function pixelsForZoom(mode: TimelineZoomMode, range: ScheduleRange, viewportWidth: number) {
  if (mode !== "fit") {
    return zoomPixelsPerDay[mode];
  }

  const fitted = viewportWidth / Math.max(range.totalDays + 1, 1);
  return Math.max(1.2, Math.min(42, fitted));
}

export function createTimelineScale(mode: TimelineZoomMode, range: ScheduleRange, viewportWidth: number): TimelineScale {
  const pixelsPerDay = pixelsForZoom(mode, range, Math.max(320, viewportWidth));
  const timelineWidth = Math.max(Math.ceil((range.totalDays + 1) * pixelsPerDay), viewportWidth);

  return {
    mode,
    pixelsPerDay,
    timelineWidth,
    visibleStartDate: range.startDate,
    visibleEndDate: range.endDate
  };
}

export function dateToX(date: string, range: ScheduleRange, scale: TimelineScale) {
  return Math.max(0, daysBetween(range.startDate, date) * scale.pixelsPerDay);
}

export function xToDate(x: number, range: ScheduleRange, scale: TimelineScale) {
  const offsetDays = Math.round(Math.max(0, x) / Math.max(scale.pixelsPerDay, 1));
  return addDays(range.startDate, offsetDays);
}

export function generateTimelineHeaderTicks(range: ScheduleRange, scale: TimelineScale): TimelineHeaderTick[] {
  const ticks: TimelineHeaderTick[] = [];
  const totalDays = Math.max(range.totalDays, 1);
  const minorStep = scale.mode === "day" ? 1 : scale.mode === "week" ? 7 : scale.mode === "month" ? 30 : 91;

  for (let day = 0; day <= totalDays; day += minorStep) {
    const date = addDays(range.startDate, day);
    ticks.push({
      date,
      label: formatDateOnly(date, scale.mode === "day" || scale.mode === "week" ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" }),
      positionPx: dateToX(date, range, scale),
      level: "minor"
    });
  }

  const start = parseDateOnly(range.startDate);
  if (start) {
    const cursor = new Date(start);
    cursor.setUTCDate(1);

    while (toDateOnly(cursor) <= range.endDate) {
      const date = toDateOnly(cursor);
      if (date >= range.startDate) {
        ticks.push({
          date,
          label: formatDateOnly(date, { month: "long", year: "numeric" }),
          positionPx: dateToX(date, range, scale),
          level: "major"
        });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + (scale.mode === "quarter" ? 3 : 1));
    }
  }

  if (!ticks.some((tick) => tick.date === range.endDate && tick.level === "minor")) {
    ticks.push({
      date: range.endDate,
      label: formatDateOnly(range.endDate),
      positionPx: dateToX(range.endDate, range, scale),
      level: "minor"
    });
  }

  return ticks.sort((left, right) => left.positionPx - right.positionPx || left.level.localeCompare(right.level));
}

export function nextPeriod(date: string, mode: TimelineZoomMode, direction: -1 | 1) {
  if (mode === "day") {
    return addDays(date, direction);
  }

  if (mode === "week" || mode === "fit") {
    return addDays(date, direction * 7);
  }

  if (mode === "month") {
    return addMonths(date, direction);
  }

  return addMonths(date, direction * 3);
}
