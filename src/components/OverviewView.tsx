"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MobileFilters } from "./MobileFilters";
import { archiveDayHref } from "../lib/paths";
import {
  AddOrganizationLink,
  OrgNameMenu,
  OrgPicker,
  SetDateActiveLink,
  organizationAddHref,
  organizationEditHref,
} from "./OrgPicker";
import { EmptyBody, ErrorBody } from "./PageStates";
import { attachmentDashboardUrls } from "../app/actions/attachments";
import { ModalShell } from "./ModalShell";
import { useDemo } from "../lib/demo";
import {
  ATTENDANCE_OPTIONS,
  RATING_FACES,
  filterOrgList,
  isBlankDay,
  orgRange,
  sortOrgs,
  todayIso,
  type ArtifactRow,
  type Attendance,
  type DayEntry,
  type Org,
  type OrgSort,
  type OrgStatusFilter,
  type WorkRow,
} from "../lib/data";
import {
  isoDay,
  periodExportLabel,
  periodLabel,
  periodRange,
  type Period,
  viewCursors,
} from "../lib/periods";

const OVERVIEW_SECTIONS = [
  { id: "logged", label: "Logged Days" },
  { id: "attendance", label: "Attendance" },
  { id: "work", label: "Work Completed" },
  { id: "artifacts", label: "Citations / Artifacts" },
  { id: "rating", label: "Rating" },
] as const;

type OverviewTab = (typeof OVERVIEW_SECTIONS)[number]["id"];
type OverviewExport = "work" | "artifacts";

function emptyAttendance() {
  return Object.fromEntries(
    ATTENDANCE_OPTIONS.map((option) => [option.id, 0]),
  ) as Record<Attendance, number>;
}

function emptyRatings() {
  return Object.fromEntries(RATING_FACES.map((face) => [face.value, 0])) as Record<
    (typeof RATING_FACES)[number]["value"],
    number
  >;
}

function eachIso(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    days.push(isoDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function overviewStats(
  org: Org,
  archiveStart: string,
  period: Period,
  cursor: string,
  dayMap: Record<string, DayEntry> | undefined,
  today: string,
) {
  const window = periodRange(period, cursor, today);
  const { minIso: orgMin, maxIso: orgMax } = orgRange(org, archiveStart, today);
  const start =
    period === "all" || window.start < orgMin ? orgMin : window.start;
  const end = period === "all" || window.end > orgMax ? orgMax : window.end;
  const attendance = emptyAttendance();
  const ratings = emptyRatings();
  const work: (WorkRow & { iso: string })[] = [];
  const artifacts: (ArtifactRow & { iso: string })[] = [];
  const trend: { iso: string; rating: number | null }[] = [];
  if (start > end) {
    return {
      logged: 0,
      created: 0,
      attendance,
      ratings,
      work,
      artifacts,
      trend,
    };
  }
  let created = 0;
  let logged = 0;
  const isos = Object.keys(dayMap ?? {})
    .filter((iso) => iso >= start && iso <= end)
    .sort((a, b) => b.localeCompare(a));
  for (const iso of isos) {
    const day = dayMap?.[iso];
    if (!day) continue;
    created += 1;
    if (!isBlankDay(day)) logged += 1;
    if (day.attendance) attendance[day.attendance] += 1;
    work.push(
      ...day.work
        .filter((row) => row.title.trim())
        .map((row) => ({ ...row, iso })),
    );
    artifacts.push(
      ...day.artifacts
        .filter((row) => row.title.trim())
        .map((row) => ({ ...row, iso })),
    );
  }
  // The trend is a calendar of this range, including dates with no created
  // day. The rating fraction above still uses days created.
  for (const iso of eachIso(start, end)) {
    const rating = dayMap?.[iso]?.rating ?? null;
    trend.push({ iso, rating });
    if (rating && rating in ratings) {
      ratings[rating as keyof typeof ratings] += 1;
    }
  }
  return {
    logged,
    created,
    attendance,
    ratings,
    work,
    artifacts,
    trend,
  };
}

type OverviewDetail = {
  kind: "text" | "link" | "file";
  label: string;
  href?: string;
};

function overviewDetails(
  ...parts: Array<OverviewDetail | null | undefined>
): OverviewDetail[] {
  return parts.filter((detail): detail is OverviewDetail => Boolean(detail));
}

function UrlIcon() {
  return (
    <svg
      className="url-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="url-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4v11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8 11.5 12 16l4-4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function groupByDate<T extends { date: string }>(items: T[]) {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

function OverviewTitles({
  items,
  empty,
  orgId,
}: {
  items: { id: string; title: string; date: string; details: OverviewDetail[] }[];
  empty: string;
  orgId: string;
}) {
  if (items.length === 0) {
    return <p className="empty-inline">{empty}</p>;
  }
  const groups = groupByDate(items);
  return (
    <div>
      {groups.map((group) => (
        <section key={group.date} className="overview-entry-group">
          <h4 className="overview-entry-date">
            <Link href={archiveDayHref(orgId, group.date)}>{group.date}</Link>
          </h4>
          <ul className="overview-entries">
            {group.items.map((item) => (
              <li key={item.id}>
                <span className="overview-entry-title">{item.title}</span>
                {item.details.length ? (
                  <div className="overview-entry-tip" role="tooltip">
                    {item.details.map((detail) => (
                      <p
                        key={`${detail.kind}-${detail.label}`}
                        className={
                          detail.kind === "text"
                            ? undefined
                            : "overview-entry-tip-row"
                        }
                      >
                        {detail.kind === "text" ? (
                          detail.label
                        ) : (
                          <>
                            {detail.kind === "link" ? (
                              <UrlIcon />
                            ) : (
                              <DownloadIcon />
                            )}
                            {detail.href ? (
                              <a
                                href={detail.href}
                                target={
                                  detail.kind === "link" ? "_blank" : undefined
                                }
                                rel={
                                  detail.kind === "link"
                                    ? "noreferrer"
                                    : undefined
                                }
                                draggable={false}
                              >
                                {detail.label}
                              </a>
                            ) : (
                              <span>{detail.label}</span>
                            )}
                          </>
                        )}
                      </p>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type ExportPickItem = {
  id: string;
  title: string;
  date: string;
  chip?: string;
  organization: string;
  description?: string;
  link?: string;
  type?: string;
  attachmentKey?: string;
};

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function fileSlug(value: string) {
  return (
    value
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9.-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}

function exportFilename(
  orgName: string,
  range: string,
  kind: "work" | "citations",
) {
  return `${fileSlug(orgName)}_${fileSlug(range)}_${kind}.csv`;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv =
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n";
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function workExportItems(
  orgName: string,
  rows: (WorkRow & { iso: string })[],
): ExportPickItem[] {
  return rows.map((row, index) => ({
    id: `work:${row.iso}:${row.id}:${index}`,
    title: row.title,
    date: row.iso,
    organization: orgName,
    description: row.description.trim(),
    link: row.link.trim(),
  }));
}

function artifactExportItems(
  orgName: string,
  rows: (ArtifactRow & { iso: string })[],
): ExportPickItem[] {
  const items: ExportPickItem[] = [];
  rows.forEach((row, index) => {
    const hasLink = Boolean(row.url.trim());
    const hasFile = Boolean(row.attachment.trim());
    if (hasLink) {
      items.push({
        id: `artifacts:${row.iso}:${row.id}:${index}:link`,
        title: row.title,
        date: row.iso,
        chip: "Link",
        organization: orgName,
        type: "Link",
        link: row.url.trim(),
      });
    }
    if (hasFile) {
      items.push({
        id: `artifacts:${row.iso}:${row.id}:${index}:attachment`,
        title: row.title,
        date: row.iso,
        chip: "Attachment",
        organization: orgName,
        type: "Attachment",
        link: "",
        attachmentKey: row.attachmentKey.trim(),
      });
    }
    if (!hasLink && !hasFile) {
      items.push({
        id: `artifacts:${row.iso}:${row.id}:${index}`,
        title: row.title,
        date: row.iso,
        organization: orgName,
        type: "",
        link: "",
      });
    }
  });
  return items;
}

function ExportPickList({
  heading,
  sub,
  actionLabel,
  items,
  empty,
  selected,
  onToggle,
  onToggleAll,
  onExport,
}: {
  heading: string;
  sub: string;
  actionLabel: string;
  items: ExportPickItem[];
  empty: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onExport: () => void | Promise<void>;
}) {
  const ids = items.map((item) => item.id);
  const allSelected =
    ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <>
      <header className="day-section-head">
        <h3>{heading}</h3>
        {ids.length > 0 ? (
          <button
            type="button"
            className="text-link add-row-link"
            onClick={() => onToggleAll(ids, !allSelected)}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        ) : null}
      </header>
      <p className="day-section-sub">{sub}</p>
      {items.length === 0 ? (
        <p className="empty-inline">{empty}</p>
      ) : (
        <div className="filter-set">
          {groupByDate(items).map((group) => (
            <section key={group.date} className="overview-entry-group">
              <h4 className="overview-entry-date">{group.date}</h4>
              <ul className="overview-entries">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => onToggle(item.id)}
                      />
                      {item.chip ? (
                        <span className="overview-export-chip">{item.chip}</span>
                      ) : null}
                      <span className="overview-entry-title">{item.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="day-form-actions factory-reset-actions">
        <button
          type="button"
          className="text-btn"
          disabled={!ids.some((id) => selected.has(id))}
          onClick={onExport}
        >
          {actionLabel}
        </button>
      </div>
    </>
  );
}

function utcDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function weekdayDateLabel(iso: string) {
  const date = utcDate(iso);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  const rest = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `${weekday} ${rest}`;
}

function monthDayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate(iso));
}

function monthLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(utcDate(iso));
}

function sundayOf(iso: string) {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return isoDay(date);
}

function chartAxisLabels(
  period: Period,
  points: { iso: string; rating: number | null }[],
) {
  if (points.length === 0) return [];
  if (period === "week") {
    return points.map((point, index) => ({
      index,
      text: weekdayDateLabel(point.iso),
    }));
  }
  if (period === "month" || (period === "rolling" && points.length <= 45)) {
    const labels: { index: number; text: string }[] = [];
    const seen = new Set<string>();
    points.forEach((point, index) => {
      const sunday = sundayOf(point.iso);
      if (seen.has(sunday)) return;
      seen.add(sunday);
      const sundayIndex = points.findIndex((item) => item.iso === sunday);
      labels.push({
        index: sundayIndex >= 0 ? sundayIndex : index,
        text: `week of ${monthDayLabel(sunday)}`,
      });
    });
    return labels;
  }
  if (period === "year" || period === "quarter" || period === "rolling") {
    const labels: { index: number; text: string }[] = [];
    const seen = new Set<string>();
    points.forEach((point, index) => {
      const key = point.iso.slice(0, 7);
      if (seen.has(key)) return;
      seen.add(key);
      labels.push({ index, text: monthLabel(point.iso) });
    });
    return labels;
  }
  const labels: { index: number; text: string }[] = [];
  const seen = new Set<string>();
  points.forEach((point, index) => {
    const year = point.iso.slice(0, 4);
    if (seen.has(year)) return;
    seen.add(year);
    labels.push({ index, text: year });
  });
  return labels;
}

function RatingTrend({
  period,
  points,
}: {
  period: Period;
  points: { iso: string; rating: number | null }[];
}) {
  const width = 720;
  const height = 292;
  const pad = { left: 58, right: 20, top: 32, bottom: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const last = Math.max(points.length - 1, 1);
  const axis = chartAxisLabels(period, points);

  function xFor(index: number) {
    return pad.left + (index / last) * innerW;
  }

  function yFor(rating: number) {
    return pad.top + ((5 - rating) / 4) * innerH;
  }

  const rated = points.flatMap((point, index) =>
    point.rating ? [{ index, rating: point.rating, iso: point.iso }] : [],
  );
  const line = rated
    .map((point) => `${xFor(point.index).toFixed(1)},${yFor(point.rating).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      className="overview-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Rating trend"
    >
      {RATING_FACES.map((face) => {
        const y = yFor(face.value);
        return (
          <g key={face.value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              className="overview-chart-grid"
            />
            <text
              x={pad.left - 10}
              y={y - 14}
              textAnchor="end"
              className="overview-chart-face-label"
            >
              {face.label}
            </text>
            <text
              x={pad.left - 10}
              y={y + 6}
              textAnchor="end"
              className="overview-chart-emoji"
            >
              {face.face}
            </text>
          </g>
        );
      })}
      {line ? (
        <polyline className="overview-chart-line" fill="none" points={line} />
      ) : null}
      {rated.map((point) => (
        <circle
          key={point.iso}
          className="overview-chart-point"
          cx={xFor(point.index)}
          cy={yFor(point.rating)}
          r="5"
        >
          <title>
            {point.iso}:{" "}
            {RATING_FACES.find((face) => face.value === point.rating)?.label ??
              point.rating}
          </title>
        </circle>
      ))}
      {axis.map((label) => {
        const isFirst = label.index === 0;
        const isLast = label.index === last && points.length > 1;
        return (
          <text
            key={`${label.index}-${label.text}`}
            x={xFor(label.index)}
            y={height - 16}
            textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
            className="overview-chart-label"
          >
            {label.text}
          </text>
        );
      })}
    </svg>
  );
}

function PeriodFilters({
  period,
  cursor,
  views,
  onPeriod,
  onCursor,
}: {
  period: Period;
  cursor: string;
  views: string[];
  onPeriod: (next: Period) => void;
  onCursor: (next: string) => void;
}) {
  return (
    <div className="setting-field">
      <span className="setting-label">Period</span>
      <select
        className="app-field app-select"
        aria-label="Period"
        value={period}
        onChange={(event) => onPeriod(event.target.value as Period)}
      >
        <option value="week">Week</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
        <option value="rolling">Rolling</option>
        <option value="all">All Time</option>
      </select>
      {period === "all" || views.length === 0 ? null : (
        <select
          className="app-field app-select"
          aria-label="View"
          value={views.includes(cursor) ? cursor : views[0]}
          onChange={(event) => onCursor(event.target.value)}
        >
          {views.map((value) => (
            <option key={value} value={value}>
              {periodLabel(period, value)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function OverviewView() {
  const { status, settings, days, attachmentHref } = useDemo();
  const dbError = status === "error";
  const orgs = dbError ? [] : settings.orgs;
  const addHref =
    !dbError && orgs.length === 0 ? organizationAddHref() : undefined;
  const noOrgs = orgs.length === 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<OrgSort>("new");
  const [showHidden, setShowHidden] = useState(false);
  const [orgStatus, setOrgStatus] = useState<OrgStatusFilter>("all");
  const today = todayIso(undefined, settings.timezone);
  const [period, setPeriod] = useState<Period>("week");
  const [cursor, setCursor] = useState(today);
  const [tab, setTab] = useState<OverviewTab>("logged");
  const [exportOpen, setExportOpen] = useState<OverviewExport | null>(null);
  const [exportSelected, setExportSelected] = useState<Set<string>>(
    () => new Set(),
  );

  function closeExport() {
    setExportOpen(null);
  }

  function openExport(kind: OverviewExport) {
    setExportSelected(new Set());
    setExportOpen(kind);
  }

  function toggleExportRow(id: string) {
    setExportSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExportRows(ids: string[], select: boolean) {
    setExportSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!exportOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeExport();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen]);

  const selected = selectedId
    ? (orgs.find((org) => org.id === selectedId) ?? null)
    : null;

  const views = useMemo(() => {
    if (!selected || period === "all") return [];
    const { minIso, maxIso } = orgRange(
      selected,
      settings.archiveStartDate,
      today,
    );
    const windowed: Record<string, DayEntry> = {};
    for (const [iso, day] of Object.entries(days[selected.id] ?? {})) {
      if (iso >= minIso && iso <= maxIso) windowed[iso] = day;
    }
    return viewCursors(period, windowed, today);
  }, [selected, period, days, today, settings.archiveStartDate]);

  if (/^\d{4}-\d{2}-\d{2}$/.test(cursor) && cursor > today) {
    setCursor(today);
  }

  if (period !== "all" && views.length > 0) {
    if (period === "rolling") {
      if (!views.includes(cursor)) setCursor(views[0]);
    } else {
      const canonical = /^\d{4}-\d{2}-\d{2}$/.test(cursor)
        ? periodRange(period, cursor, today).start
        : "";
      if (canonical && views.includes(canonical) && cursor !== canonical) {
        setCursor(canonical);
      } else if (!views.includes(cursor)) {
        setCursor(views[0]);
      }
    }
  }

  const stats = useMemo(
    () =>
      selected
        ? overviewStats(
            selected,
            settings.archiveStartDate,
            period,
            cursor,
            days[selected.id],
            today,
          )
        : null,
    [selected, settings.archiveStartDate, period, cursor, days, today],
  );

  if (selectedId && (!orgs.length || !orgs.some((org) => org.id === selectedId))) {
    setSelectedId(null);
  }

  const visibleOrgs = filterOrgList(orgs, { showHidden, orgStatus, today });
  const sortedOrgs = sortOrgs(visibleOrgs, sortOrder);
  const workItems =
    selected && stats ? workExportItems(selected.name, stats.work) : [];
  const citationItems =
    selected && stats
      ? artifactExportItems(selected.name, stats.artifacts)
      : [];

  function exportWorkCsv() {
    if (!selected) return;
    const rows = workItems.filter((item) => exportSelected.has(item.id));
    if (rows.length === 0) return;
    downloadCsv(
      exportFilename(selected.name, periodExportLabel(period, cursor), "work"),
      ["organization", "date", "title", "description", "link"],
      rows.map((item) => [
        item.organization,
        item.date,
        item.title,
        item.description ?? "",
        item.link ?? "",
      ]),
    );
  }

  async function exportCitationsCsv() {
    if (!selected) return;
    const rows = citationItems.filter((item) => exportSelected.has(item.id));
    if (rows.length === 0) return;
    const keys = [
      ...new Set(
        rows
          .map((item) => item.attachmentKey)
          .filter((key): key is string => Boolean(key)),
      ),
    ];
    const urls: Record<string, string> = await attachmentDashboardUrls(keys);
    downloadCsv(
      exportFilename(
        selected.name,
        periodExportLabel(period, cursor),
        "citations",
      ),
      ["organization", "date", "type", "title", "url", "attachment"],
      rows.map((item) => [
        item.organization,
        item.date,
        item.type ?? "",
        item.title,
        item.link ?? "",
        (item.attachmentKey && urls[item.attachmentKey]) || "",
      ]),
    );
  }

  const missingDateActive = Boolean(selected && !selected.dateActive);
  const pickerProps = {
    orgs: sortedOrgs,
    selectedId: selected?.id ?? null,
    sortOrder,
    showHidden,
    orgStatus,
    onSort: setSortOrder,
    onShowHidden: setShowHidden,
    onOrgStatus: setOrgStatus,
    onSelect: (org: Org) => {
      setSelectedId(org.id);
      setTab("logged");
    },
  };

  return (
      <div className="page-cols">
        <div className="org-layout">
          <aside
            className={`org-sidebar${dbError || noOrgs ? " is-inert" : ""}`}
            inert={dbError || noOrgs || undefined}
          >
            <OrgPicker {...pickerProps} />
          </aside>
          <section
            className={`org-day${selected && !missingDateActive ? "" : " org-day-empty"}`}
            aria-label="Overview"
          >
            <header className="day-heading">
              {selected ? (
                <>
                  {!missingDateActive ? (
                    <h2 className="day-title">{periodLabel(period, cursor)}</h2>
                  ) : null}
                  <OrgNameMenu
                    name={selected.name}
                    {...pickerProps}
                  />
                </>
              ) : (
                <h1 className="page-title">Overview</h1>
              )}
            </header>
            <div className="org-day-body">
              {missingDateActive && selected ? (
                <EmptyBody
                  kicker=""
                  copy={`${selected.name} has no Date Active defined.`}
                  action={
                    <SetDateActiveLink
                      href={organizationEditHref(selected.id)}
                      name={selected.name}
                    />
                  }
                />
              ) : selected ? (
                <>
                  <article className="col-copy day-panel">
                    <div
                      className="day-tabs"
                      role="tablist"
                      aria-label="Overview sections"
                    >
                      {OVERVIEW_SECTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={tab === item.id}
                          className={tab === item.id ? "is-active" : undefined}
                          onClick={() => setTab(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {OVERVIEW_SECTIONS.map((item) => (
                      <section
                        key={item.id}
                        className={`day-section${tab === item.id ? " is-active" : ""}`}
                      >
                        {item.id === "work" || item.id === "artifacts" ? (
                          <header className="day-section-head">
                            <h3>{item.label}</h3>
                            <button
                              type="button"
                              className="plus-btn add-row-link"
                              disabled={
                                item.id === "work"
                                  ? workItems.length === 0
                                  : citationItems.length === 0
                              }
                              onClick={() => openExport(item.id)}
                            >
                              Export
                            </button>
                          </header>
                        ) : (
                          <h3>{item.label}</h3>
                        )}
                        {item.id === "logged" && stats ? (
                          <>
                            <p className="day-section-sub">
                              Days with logs over days created in this range.
                            </p>
                            <p className="overview-stat">
                              {stats.logged}/{stats.created}
                            </p>
                          </>
                        ) : null}
                        {item.id === "attendance" && stats ? (
                          <>
                            <p className="day-section-sub">
                              Days with logged attendance value over days created
                              in this range.
                            </p>
                            <table className="overview-table overview-metric-table">
                            <thead>
                              <tr>
                                {ATTENDANCE_OPTIONS.map((option) => (
                                  <th key={option.id}>{option.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {ATTENDANCE_OPTIONS.map((option) => (
                                  <td key={option.id}>
                                    {stats.attendance[option.id]}/{stats.created}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                          </>
                        ) : null}
                        {item.id === "work" && stats ? (
                          <>
                            <p className="day-section-sub">
                              Work completed logged on days in this range.
                            </p>
                            <OverviewTitles
                            orgId={selected.id}
                            empty="No work logged."
                            items={stats.work.map((row, index) => ({
                              id: `${row.id}-${index}`,
                              title: row.title,
                              date: row.iso,
                              details: overviewDetails(
                                row.description.trim()
                                  ? {
                                      kind: "text",
                                      label: row.description.trim(),
                                    }
                                  : null,
                                row.link.trim()
                                  ? {
                                      kind: "link",
                                      label: row.link.trim(),
                                      href: row.link.trim(),
                                    }
                                  : null,
                              ),
                            }))}
                          />
                          </>
                        ) : null}
                        {item.id === "artifacts" && stats ? (
                          <>
                            <p className="day-section-sub">
                              Citations and artifacts logged on days in this
                              range.
                            </p>
                            <OverviewTitles
                            orgId={selected.id}
                            empty="No citations or artifacts."
                            items={stats.artifacts.map((row, index) => ({
                              id: `${row.id}-${index}`,
                              title: row.title,
                              date: row.iso,
                              details: overviewDetails(
                                row.url.trim()
                                  ? {
                                      kind: "link",
                                      label: row.url.trim(),
                                      href: row.url.trim(),
                                    }
                                  : null,
                                row.attachment.trim()
                                  ? {
                                      kind: "file",
                                      label: row.attachment.trim(),
                                      href:
                                        row.attachmentKey && attachmentHref
                                          ? attachmentHref(
                                              row.attachmentKey,
                                              row.attachment.trim(),
                                            )
                                          : undefined,
                                    }
                                  : null,
                              ),
                            }))}
                          />
                          </>
                        ) : null}
                        {item.id === "rating" && stats ? (
                          <>
                            <p className="day-section-sub">
                              Days with each rating over days created in this
                              range.
                            </p>
                            <table className="overview-table overview-rating-table">
                              <thead>
                                <tr>
                                  {RATING_FACES.map((face) => (
                                    <th key={face.value}>
                                      <span className="overview-rating-head">
                                        <span className="rating-face-label">
                                          {face.label}
                                        </span>
                                        <span className="rating-face-emoji">
                                          {face.face}
                                        </span>
                                      </span>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  {RATING_FACES.map((face) => (
                                    <td key={face.value}>
                                      {stats.ratings[face.value]}/{stats.created}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                            <RatingTrend period={period} points={stats.trend} />
                          </>
                        ) : null}
                      </section>
                    ))}
                  </article>
                </>
              ) : dbError ? (
                <ErrorBody />
              ) : orgs.length === 0 ? (
                <EmptyBody
                  copy="No organization archive data."
                  action={
                    addHref ? <AddOrganizationLink href={addHref} /> : undefined
                  }
                />
              ) : (
                <>
                  <div className="org-landing-picker">
                    <OrgPicker {...pickerProps} parts="list" />
                  </div>
                  <p className="org-empty-prompt">
                    Select an organization to begin.
                  </p>
                </>
              )}
            </div>
          </section>
          <section
            className={`org-filters${dbError || noOrgs || missingDateActive ? " is-inert" : ""}`}
            aria-label="Period"
            inert={dbError || noOrgs || missingDateActive || undefined}
          >
            <PeriodFilters
              period={period}
              cursor={cursor}
              views={views}
              onPeriod={setPeriod}
              onCursor={setCursor}
            />
          </section>
        </div>
        {selected && !missingDateActive ? (
          <MobileFilters
            disabled={dbError || noOrgs}
            label="filter overview"
          >
            <PeriodFilters
              period={period}
              cursor={cursor}
              views={views}
              onPeriod={setPeriod}
              onCursor={setCursor}
            />
          </MobileFilters>
        ) : (
          <MobileFilters disabled={dbError || noOrgs}>
            <OrgPicker {...pickerProps} parts="controls" />
          </MobileFilters>
        )}
        {exportOpen && selected ? (
          <ModalShell onClose={closeExport}>
            <div
              className="modal settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="overview-export-title"
            >
              <header className="settings-modal-head">
                <h2 id="overview-export-title" className="modal-title">
                  Export {selected.name}
                </h2>
                <button
                  type="button"
                  className="icon-btn modal-close"
                  aria-label="Close"
                  onClick={closeExport}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </header>
              <div className="modal-fields">
                <section className="day-section is-active">
                  {exportOpen === "work" ? (
                    <ExportPickList
                      heading="Work Completed"
                      sub={periodLabel(period, cursor)}
                      actionLabel="Export Work"
                      empty="No work logged."
                      selected={exportSelected}
                      onToggle={toggleExportRow}
                      onToggleAll={toggleExportRows}
                      onExport={exportWorkCsv}
                      items={workItems}
                    />
                  ) : (
                    <ExportPickList
                      heading="Citations / Artifacts"
                      sub={periodLabel(period, cursor)}
                      actionLabel="Export Citations & Artifacts"
                      empty="No citations or artifacts."
                      selected={exportSelected}
                      onToggle={toggleExportRow}
                      onToggleAll={toggleExportRows}
                      onExport={exportCitationsCsv}
                      items={citationItems}
                    />
                  )}
                </section>
              </div>
            </div>
          </ModalShell>
        ) : null}
      </div>
  );
}
