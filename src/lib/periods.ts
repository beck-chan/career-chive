import { addMonths, daysInMonth, isoDate, type DayEntry } from "@/lib/data";

export type Period = "week" | "month" | "quarter" | "year" | "rolling" | "all";

export const ROLLING_VIEWS = [
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "6m", label: "Last 6 Months" },
  { id: "9m", label: "Last 9 Months" },
  { id: "1y", label: "Last Year" },
] as const;

export function isoDay(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return isoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function addUtcDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

function addUtcMonths(iso: string, months: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  const { year, month } = addMonths(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    months,
  );
  return isoDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function rollingRange(cursor: string, today: string) {
  const end = today;
  if (cursor === "90d") return { start: addUtcDays(end, -89), end };
  if (cursor === "6m") return { start: addUtcMonths(end, -6), end };
  if (cursor === "9m") return { start: addUtcMonths(end, -9), end };
  if (cursor === "1y") return { start: addUtcMonths(end, -12), end };
  return { start: addUtcDays(end, -29), end };
}

function weekRangeParts(cursor: string) {
  const date = new Date(`${cursor}T12:00:00Z`);
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    year: start.getUTCFullYear(),
    startText: day.format(start),
    endText: day.format(end),
  };
}

export function weekLabelParts(cursor: string) {
  const { year, startText, endText } = weekRangeParts(cursor);
  return {
    start: `${year} / ${startText}`,
    end: `– ${endText}`,
  };
}

export function periodLabel(
  period: Period,
  cursor: string,
  options?: { weekBreak?: boolean },
) {
  if (period === "all") return "All Time";
  if (period === "rolling") {
    return (
      ROLLING_VIEWS.find((view) => view.id === cursor)?.label ?? "Last 30 Days"
    );
  }
  const date = new Date(`${cursor}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  if (period === "week") {
    const { year, startText, endText } = weekRangeParts(cursor);
    if (options?.weekBreak) return `${year} / ${startText}\n– ${endText}`;
    return `${year} / ${startText} – ${endText}`;
  }
  if (period === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  if (period === "quarter") {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${date.getUTCFullYear()} Q${quarter}`;
  }
  return String(date.getUTCFullYear());
}

export function periodExportLabel(period: Period, cursor: string) {
  if (period === "quarter") {
    const date = new Date(`${cursor}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `Q${quarter} ${date.getUTCFullYear()}`;
  }
  return periodLabel(period, cursor);
}

export function periodRange(period: Period, cursor: string, today: string) {
  if (period === "all") {
    return { start: "", end: "" };
  }
  if (period === "rolling") return rollingRange(cursor, today);
  const date = new Date(`${cursor}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return { start: "", end: "" };
  if (period === "week") {
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start: isoDay(start), end: isoDay(end) };
  }
  if (period === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start: isoDay(start), end: isoDay(end) };
  }
  if (period === "quarter") {
    const startMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(date.getUTCFullYear(), startMonth, 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), startMonth + 3, 0));
    return { start: isoDay(start), end: isoDay(end) };
  }
  const year = date.getUTCFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function viewCursors(
  period: Period,
  dayMap: Record<string, DayEntry> | undefined,
  today: string,
) {
  if (period === "all") return [];
  const isos = Object.keys(dayMap ?? {}).filter((iso) => iso <= today);
  if (period === "rolling") {
    return ROLLING_VIEWS.filter((view) => {
      const { start, end } = rollingRange(view.id, today);
      return isos.some((iso) => iso >= start && iso <= end);
    }).map((view) => view.id);
  }
  const seen = new Set<string>();
  const cursors: string[] = [];
  isos
    .sort((a, b) => b.localeCompare(a))
    .forEach((iso) => {
      const cursor = periodRange(period, iso, today).start;
      if (!cursor || cursor > today || seen.has(cursor)) return;
      seen.add(cursor);
      cursors.push(cursor);
    });
  return cursors;
}
