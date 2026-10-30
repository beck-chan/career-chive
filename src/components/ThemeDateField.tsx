"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "@/lib/theme";
import {
  TODAY,
  addMonths,
  daysInMonth,
  isoDate,
} from "@/lib/data";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function parseIso(value: string, kind: "date" | "month") {
  const match =
    kind === "month"
      ? /^(\d{4})-(\d{2})$/.exec(value)
      : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: kind === "date" ? Number(match[3]) : 1,
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatValue(value: string, kind: "date" | "month") {
  const parsed = parseIso(value, kind);
  if (!parsed) return value || "Select";
  if (kind === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

function inRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function expandYear(year: number) {
  if (year < 100) return year + 2000;
  return year;
}

function parseMonthToken(token: string) {
  const key = token.toLowerCase().replace(/\./g, "");
  const shortIndex = MONTHS.findIndex((label) => label.toLowerCase() === key);
  if (shortIndex >= 0) return shortIndex + 1;
  const longIndex = MONTH_NAMES.findIndex(
    (label) => label === key || (key.length >= 3 && label.startsWith(key)),
  );
  if (longIndex >= 0) return longIndex + 1;
  const numeric = Number(token);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  return null;
}

function validParts(year: number, month: number, day?: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  const nextYear = expandYear(year);
  if (month < 1 || month > 12) return null;
  if (day == null) return { year: nextYear, month };
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(nextYear, month)) {
    return null;
  }
  return { year: nextYear, month, day };
}

function parseLoose(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (match) return validParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (match) return validParts(Number(match[1]), Number(match[2]));

  match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(trimmed);
  if (match) return validParts(Number(match[3]), Number(match[1]), Number(match[2]));

  match = /^(\d{1,2})[/\-.](\d{2,4})$/.exec(trimmed);
  if (match) return validParts(Number(match[2]), Number(match[1]));

  match = /^([A-Za-z.]+)\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(trimmed);
  if (match) {
    const month = parseMonthToken(match[1]);
    if (month) return validParts(Number(match[3]), month, Number(match[2]));
  }

  match = /^(\d{1,2})\s+([A-Za-z.]+),?\s+(\d{2,4})$/.exec(trimmed);
  if (match) {
    const month = parseMonthToken(match[2]);
    if (month) return validParts(Number(match[3]), month, Number(match[1]));
  }

  match = /^([A-Za-z.]+)\s+(\d{2,4})$/.exec(trimmed);
  if (match) {
    const month = parseMonthToken(match[1]);
    if (month) return validParts(Number(match[2]), month);
  }

  return null;
}

function yearOptions(
  min?: string,
  max?: string,
  extraYear?: number,
  today = TODAY,
) {
  const todayYear = Number(today.slice(0, 4));
  let start = min ? Number(min.slice(0, 4)) : todayYear - 10;
  let end = max ? Number(max.slice(0, 4)) : todayYear;
  end = Math.min(end, todayYear);
  if (extraYear != null && extraYear <= todayYear) {
    if (extraYear > end) end = extraYear;
    if (!min && extraYear < start) start = extraYear;
  }
  if (start > end) start = end;
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

function monthVisible(
  year: number,
  month: number,
  min?: string,
  max?: string,
  today = TODAY,
) {
  if (year > Number(today.slice(0, 4))) return false;
  const start = isoDate(year, month, 1);
  const end = isoDate(year, month, daysInMonth(year, month));
  if (max && start > max) return false;
  if (min && end < min) return false;
  return true;
}

function yearVisible(year: number, min?: string, max?: string, today = TODAY) {
  return MONTHS.some((_, index) =>
    monthVisible(year, index + 1, min, max, today),
  );
}

function earlierBound(...values: (string | undefined)[]) {
  const found = values.filter((value): value is string => Boolean(value));
  if (!found.length) return undefined;
  return [...found].sort()[0];
}

function asKindBound(value: string | undefined, kind: "date" | "month") {
  if (!value) return undefined;
  return kind === "month" ? value.slice(0, 7) : value;
}

function snapView(year: number, month: number, min?: string, max?: string) {
  let next = { year, month };
  if (min && max && min > max) {
    min = max;
  }
  if (min) {
    const minYear = Number(min.slice(0, 4));
    const minMonth = Number(min.slice(5, 7));
    if (next.year < minYear || (next.year === minYear && next.month < minMonth)) {
      next = { year: minYear, month: minMonth };
    }
  }
  if (max) {
    const maxYear = Number(max.slice(0, 4));
    const maxMonth = Number(max.slice(5, 7));
    if (next.year > maxYear || (next.year === maxYear && next.month > maxMonth)) {
      next = { year: maxYear, month: maxMonth };
    }
  }
  return next;
}

export function ThemeDateField({
  kind = "date",
  value,
  min,
  max,
  className,
  "aria-label": ariaLabel,
  variant = "field",
  disabled,
  until,
  today = TODAY,
  children,
  placeholder = "Select",
  allowEmpty = false,
  onChange,
}: {
  kind?: "date" | "month";
  value: string;
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
  variant?: "field" | "heading";
  disabled?: boolean;
  until?: string;
  today?: string;
  children?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const todayKey = kind === "month" ? today.slice(0, 7) : today;
  const minBound = asKindBound(min, kind);
  const hideMax = asKindBound(until, kind);
  const selectMax = earlierBound(todayKey, hideMax, asKindBound(max, kind));
  const viewMax = earlierBound(
    kind === "month" ? `${today.slice(0, 4)}-12` : `${today.slice(0, 4)}-12-31`,
    hideMax,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const parsed = parseIso(value, kind) ?? parseIso(today, "date")!;
  const [view, setView] = useState({ year: parsed.year, month: parsed.month });
  const [typed, setTyped] = useState(formatValue(value, kind));
  const [typedError, setTypedError] = useState("");
  const typedErrorId = useId();

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    const width = 16.75 * 16;
    const height = (typedError ? 24 : 22) * 16;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height);
    }
    setPos({ top, left });
  }, [open, typedError]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      typedRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const keep = event.composedPath().some((node) => {
        if (!(node instanceof Element)) return false;
        return (
          node.classList.contains("theme-picker") ||
          node.classList.contains("theme-picker-panel") ||
          node.tagName === "SELECT" ||
          node.tagName === "OPTION"
        );
      });
      if (keep) return;
      setOpen(false);
    }
    function onScroll(event: Event) {
      const node = event.target;
      if (
        node instanceof Element &&
        node.closest(".theme-picker-panel, .theme-picker")
      ) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (!open && typedError) setTypedError("");

  function toggleOpen() {
    if (open) {
      setOpen(false);
      setTypedError("");
      return;
    }
    setTyped(formatValue(value, kind));
    setTypedError("");
    const next = parseIso(value, kind);
    if (next) setView(snapView(next.year, next.month, minBound, viewMax));
    setOpen(true);
  }

  const first = new Date(Date.UTC(view.year, view.month - 1, 1));
  const pad = first.getUTCDay();
  const count = daysInMonth(view.year, view.month);
  const selected = parseIso(value, kind);
  const typedParts = parseLoose(typed);
  const previewIso =
    kind === "date" && typedParts?.day
      ? isoDate(typedParts.year, typedParts.month, typedParts.day)
      : kind === "month" && typedParts
        ? monthKey(typedParts.year, typedParts.month)
        : null;
  const years = yearOptions(minBound, viewMax, view.year, today);
  const prevView =
    kind === "month"
      ? { year: view.year - 1, month: view.month }
      : addMonths(view.year, view.month, -1);
  const nextView =
    kind === "month"
      ? { year: view.year + 1, month: view.month }
      : addMonths(view.year, view.month, 1);
  const canPrev =
    kind === "month"
      ? yearVisible(prevView.year, minBound, hideMax, today)
      : monthVisible(prevView.year, prevView.month, minBound, hideMax, today);
  const canNext =
    kind === "month"
      ? yearVisible(nextView.year, minBound, viewMax, today)
      : monthVisible(nextView.year, nextView.month, minBound, viewMax, today);

  function clearValue() {
    setTypedError("");
    onChange("");
    setOpen(false);
  }

  function pickDate(day: number) {
    const iso = isoDate(view.year, view.month, day);
    if (allowEmpty && value === iso) {
      clearValue();
      return;
    }
    if (!inRange(iso, minBound, selectMax)) return;
    setTypedError("");
    onChange(iso);
    setOpen(false);
  }

  function pickMonth(month: number) {
    const iso = monthKey(view.year, month);
    if (!inRange(iso, minBound, selectMax)) return;
    setTypedError("");
    onChange(iso);
    setOpen(false);
  }

  function commitTyped() {
    if (allowEmpty && !typed.trim()) {
      clearValue();
      return;
    }
    const nextIso =
      kind === "date" && typedParts?.day
        ? isoDate(typedParts.year, typedParts.month, typedParts.day)
        : kind === "month" && typedParts
          ? monthKey(typedParts.year, typedParts.month)
          : null;
    if (!nextIso) {
      setTypedError(
        kind === "month" ? "Enter a valid month." : "Enter a valid date.",
      );
      return;
    }
    if (!inRange(nextIso, minBound, selectMax)) {
      setTypedError(
        kind === "month"
          ? "That month is outside the archive range."
          : "That date is outside the archive range.",
      );
      return;
    }
    setTypedError("");
    onChange(nextIso);
    setOpen(false);
  }

  const trigger =
    variant === "heading" ? (
      <button
        type="button"
        className="day-title"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
      >
        {children ?? (parseIso(value, kind) ? formatValue(value, kind) : placeholder)}
      </button>
    ) : (
      <button
        type="button"
        className={`app-field theme-picker-trigger${className ? ` ${className}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <span>
          {children ??
            (parseIso(value, kind) ? formatValue(value, kind) : placeholder)}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="4"
            y="5"
            width="16"
            height="15"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M8 3.5v3M16 3.5v3M4 9.5h16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );

  return (
    <div
      ref={rootRef}
      className={variant === "heading" ? "day-title-picker theme-picker" : "theme-picker"}
    >
      {trigger}
      {open && pos
        ? createPortal(
            <div
              className="theme-picker-panel"
              role="dialog"
              aria-label={kind === "month" ? "Choose month" : "Choose date"}
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="theme-picker-nav">
                <button
                  type="button"
                  className="pager-btn"
                  aria-label={kind === "month" ? "Previous year" : "Previous month"}
                  disabled={!canPrev}
                  onClick={() =>
                    setView((current) =>
                      snapView(
                        kind === "month" ? current.year - 1 : addMonths(current.year, current.month, -1).year,
                        kind === "month" ? current.month : addMonths(current.year, current.month, -1).month,
                        minBound,
                        viewMax,
                      ),
                    )
                  }
                >
                  ‹
                </button>
                <div className="theme-picker-nav-fields">
                  {kind === "date" ? (
                    <select
                      className="theme-picker-nav-select is-month"
                      aria-label="Month"
                      value={view.month}
                      onChange={(event) =>
                        setView((current) =>
                          snapView(current.year, Number(event.target.value), minBound, viewMax),
                        )
                      }
                    >
                      {MONTHS.flatMap((label, index) => {
                        const month = index + 1;
                        if (
                          month !== view.month &&
                          !monthVisible(view.year, month, minBound, viewMax, today)
                        ) {
                          return [];
                        }
                        return (
                          <option key={label} value={month}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  ) : null}
                  <select
                    className="theme-picker-nav-select is-year"
                    aria-label="Year"
                    value={view.year}
                    onChange={(event) =>
                      setView((current) =>
                        snapView(Number(event.target.value), current.month, minBound, viewMax),
                      )
                    }
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="pager-btn"
                  aria-label={kind === "month" ? "Next year" : "Next month"}
                  disabled={!canNext}
                  onClick={() =>
                    setView((current) =>
                      snapView(
                        kind === "month" ? current.year + 1 : addMonths(current.year, current.month, 1).year,
                        kind === "month" ? current.month : addMonths(current.year, current.month, 1).month,
                        minBound,
                        viewMax,
                      ),
                    )
                  }
                >
                  ›
                </button>
              </div>
              {kind === "month" ? (
                <div className="theme-picker-months">
                  {MONTHS.map((label, index) => {
                    const month = index + 1;
                    const iso = monthKey(view.year, month);
                    const allowed = inRange(iso, minBound, selectMax);
                    const selectedMonth =
                      allowed &&
                      (previewIso
                        ? previewIso === iso
                        : selected?.year === view.year &&
                          selected.month === month);
                    const future = iso > todayKey;
                    const unavailable = !allowed && !future;
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`theme-picker-month${selectedMonth ? " is-selected" : ""}${future ? " is-future" : ""}${unavailable ? " is-unavailable" : ""}`}
                        disabled={!allowed}
                        onClick={() => pickMonth(month)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
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
                      const iso = isoDate(view.year, view.month, day);
                      const allowed = inRange(iso, minBound, selectMax);
                      const isSelected =
                        allowed &&
                        (previewIso ? previewIso === iso : value === iso);
                      const future = iso > todayKey;
                      const unavailable = !allowed && !future;
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={`calendar-day${isSelected ? " is-selected" : ""}${future ? " is-future" : ""}${unavailable ? " is-unavailable" : ""}`}
                          disabled={!allowed}
                          onClick={() => pickDate(day)}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="theme-picker-type">
                <input
                  ref={typedRef}
                  type="text"
                  className={`app-field theme-picker-type-input${typedError ? " is-invalid" : ""}`}
                  value={typed}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={kind === "month" ? "October 2026" : "Oct 21, 2026"}
                  aria-label={kind === "month" ? "Type a month" : "Type a date"}
                  aria-invalid={typedError ? true : undefined}
                  aria-describedby={typedError ? typedErrorId : undefined}
                  onChange={(event) => {
                    const next = event.target.value;
                    setTyped(next);
                    setTypedError("");
                    const nextParts = parseLoose(next);
                    if (nextParts) {
                      setView(snapView(nextParts.year, nextParts.month, minBound, viewMax));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitTyped();
                  }}
                />
                {typedError ? (
                  <p
                    id={typedErrorId}
                    className="theme-picker-type-error"
                    role="alert"
                  >
                    {typedError}
                  </p>
                ) : null}
                {allowEmpty && value ? (
                  <button
                    type="button"
                    className="text-link theme-picker-clear"
                    onClick={clearValue}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>,
            portalRoot(),
          )
        : null}
    </div>
  );
}
