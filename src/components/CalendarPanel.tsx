"use client";

import { ThemeDateField } from "@/components/ThemeDateField";
import {
  TODAY,
  addMonths,
  daysInMonth,
  isoDate,
  isBeforeArchiveStart,
  isOnOrAfterDateInactive,
  monthLabel,
  unavailableDayLabel,
} from "@/lib/data";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DEFAULT_WINDOW = 3;

function monthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function clampMonth(
  year: number,
  month: number,
  minMonth: string,
  maxMonth: string,
) {
  const value = monthValue(year, month);
  if (value < minMonth) return parseMonth(minMonth) ?? { year, month };
  if (value > maxMonth) return parseMonth(maxMonth) ?? { year, month };
  return { year, month };
}

export function CalendarPanel({
  startYear,
  startMonth,
  selectedIso,
  minIso,
  maxIso,
  untilIso,
  onSelect,
  onPrev,
  onNext,
  onStartChange,
  createdDays,
  orgSelected = false,
  archiveStartDate = "",
  dateActive = "",
  dateInactive = "",
  today = TODAY,
  windowSize = DEFAULT_WINDOW,
  columns = 1,
}: {
  startYear: number;
  startMonth: number;
  selectedIso: string;
  minIso: string;
  maxIso: string;
  untilIso?: string;
  onSelect: (iso: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onStartChange: (year: number, month: number) => void;
  createdDays?: Record<string, unknown>;
  orgSelected?: boolean;
  archiveStartDate?: string;
  dateActive?: string;
  dateInactive?: string;
  today?: string;
  windowSize?: number;
  columns?: 1 | 2 | 3;
}) {
  const minMonth = minIso.slice(0, 7);
  const maxMonth = maxIso.slice(0, 7);
  const untilMonth = untilIso ? untilIso.slice(0, 7) : undefined;
  const newest = clampMonth(startYear, startMonth, minMonth, maxMonth);
  const months = Array.from({ length: windowSize }, (_, index) =>
    addMonths(newest.year, newest.month, -index),
  );
  const oldest = months[windowSize - 1] ?? newest;
  const oldestClamped = clampMonth(oldest.year, oldest.month, minMonth, maxMonth);
  const newestValue = monthValue(newest.year, newest.month);
  const oldestValue = monthValue(oldest.year, oldest.month);
  const canPrev = oldestValue > minMonth;
  const canNext = newestValue < maxMonth;

  function handleStart(value: string) {
    const parsed = parseMonth(value);
    if (!parsed) return;
    const newest = addMonths(parsed.year, parsed.month, windowSize - 1);
    const next = clampMonth(newest.year, newest.month, minMonth, maxMonth);
    onStartChange(next.year, next.month);
  }

  function handleEnd(value: string) {
    const parsed = parseMonth(value);
    if (!parsed) return;
    const next = clampMonth(parsed.year, parsed.month, minMonth, maxMonth);
    onStartChange(next.year, next.month);
  }

  return (
    <article className="col-copy calendar-panel">
      <header className="calendar-head">
        <div className="calendar-range">
          <ThemeDateField
            kind="month"
            className="calendar-range-input"
            value={monthValue(oldestClamped.year, oldestClamped.month)}
            min={minMonth}
            until={untilMonth}
            today={today}
            aria-label="Range start"
            onChange={handleStart}
          />
          <span className="date-range-sep" aria-hidden="true">
            –
          </span>
          <ThemeDateField
            kind="month"
            className="calendar-range-input"
            value={newestValue}
            min={minMonth}
            until={untilMonth}
            today={today}
            aria-label="Range end"
            onChange={handleEnd}
          />
        </div>
      </header>
      <div
        className="calendar-grid"
        data-columns={columns > 1 ? columns : undefined}
      >
        {months.map((slot) => {
          const first = new Date(Date.UTC(slot.year, slot.month - 1, 1));
          const pad = first.getUTCDay();
          const count = daysInMonth(slot.year, slot.month);
          return (
            <section key={`${slot.year}-${slot.month}`} className="calendar-month">
              <h3>{monthLabel(slot.year, slot.month)}</h3>
              <div className="calendar-weekdays">
                {WEEKDAYS.map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="calendar-days">
                {Array.from({ length: pad }, (_, index) => (
                  <span key={`pad-${index}`} />
                ))}
                {Array.from({ length: count }, (_, index) => {
                  const day = index + 1;
                  const iso = isoDate(slot.year, slot.month, day);
                  const future = iso > today;
                  const hiddenByStart = isBeforeArchiveStart(
                    iso,
                    archiveStartDate,
                  );
                  const inWindow =
                    !future &&
                    !hiddenByStart &&
                    iso >= minIso &&
                    iso <= maxIso &&
                    !(untilIso && iso > untilIso);
                  const exists = Boolean(
                    createdDays && Object.hasOwn(createdDays, iso),
                  );
                  const created =
                    exists &&
                    !future &&
                    !hiddenByStart &&
                    !isOnOrAfterDateInactive(iso, dateInactive);
                  const clickable = inWindow || created;
                  const selected = clickable && iso === selectedIso;
                  const isToday = iso === today;
                  const missing = inWindow && createdDays != null && !exists;
                  const unavailable = !clickable && !future;
                  const hoverLabel = !orgSelected
                    ? clickable
                      ? "Select Organization to View or Create Entry"
                      : unavailable
                        ? unavailableDayLabel(
                            iso,
                            archiveStartDate,
                            dateActive,
                            dateInactive,
                            today,
                          )
                        : undefined
                    : missing
                      ? "Create Backfilled Entry"
                      : unavailable
                        ? unavailableDayLabel(
                            iso,
                            archiveStartDate,
                            dateActive,
                            dateInactive,
                            today,
                          )
                        : undefined;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`calendar-day${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}${missing ? " is-missing" : ""}${future ? " is-future" : ""}${unavailable ? " is-unavailable" : ""}`}
                      title={hoverLabel}
                      disabled={!clickable}
                      onClick={() => clickable && onSelect(iso)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <nav className="calendar-nav" aria-label="Calendar pages">
        <button
          type="button"
          className="pager-btn"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 5 8 12l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="pager-btn"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </nav>
    </article>
  );
}
