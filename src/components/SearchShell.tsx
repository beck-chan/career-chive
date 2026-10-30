"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MobileFilters } from "./MobileFilters";
import { ModalShell } from "./ModalShell";
import { ThemeDateField } from "./ThemeDateField";
import { portalRoot } from "../lib/theme";
import {
  AddOrganizationLink,
  HiddenToggle,
  OrgStatusSelect,
  organizationAddHref,
} from "./OrgPicker";
import {
  clearChivebotChat,
  loadChivebotChat,
  sendChivebotMessage,
  type ChivebotChatMessage,
} from "../app/actions/chivebot";
import { EmptyBody, ErrorBody } from "./PageStates";
import { useDemo } from "../lib/demo";
import {
  CHIVEBOT_DISABLED_COPY,
  CHIVEBOT_DOCS_HREF,
  CHIVEBOT_ERROR_COPY,
  CHIVEBOT_QUOTA_COPY,
  archiveDayLinks,
  linkArchiveDays,
  parseChatMarkdown,
  parseChatParts,
  type ArchiveDayLink,
  type ChatBlock,
  type ChatInline,
  type ChatPart,
} from "../lib/chivebotChat";
import { flags } from "../lib/flags";
import { archiveDayHref } from "../lib/paths";
import {
  ATTENDANCE_OPTIONS,
  RATING_FACES,
  filterOrgList,
  formatDayTitle,
  orgMatchesStatus,
  orgRange,
  sortOrgs,
  todayIso,
  type DayEntry,
  type Org,
  type OrgStatusFilter,
} from "../lib/data";
import {
  periodLabel,
  periodRange,
  weekLabelParts,
  type Period,
  viewCursors,
} from "../lib/periods";

type ChatMsg = {
  id: string;
  role: "user" | "bot";
  parts: ChatPart[];
  content?: string;
  action?: { href: string; label: string };
  error?: "quota" | "error";
};
type MatchMode = "is" | "isNot";
type ContainMode = "contains" | "doesNotContain";
type CombineMode = "and" | "or";
type SearchDatePeriod =
  | "all"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "rolling"
  | "duration";

function asPeriod(period: SearchDatePeriod): Period | null {
  if (period === "all" || period === "duration") return null;
  return period;
}

function durationWindow(from: string, to: string) {
  if (from && to && from > to) return { start: to, end: from };
  return { start: from, end: to };
}

const IS_OPTIONS: { id: MatchMode; label: string }[] = [
  { id: "is", label: "is" },
  { id: "isNot", label: "is not" },
];

const CONTAIN_OPTIONS: { id: ContainMode; label: string }[] = [
  { id: "contains", label: "contains" },
  { id: "doesNotContain", label: "does not contain" },
];

const COMBINE_OPTIONS: { id: CombineMode; label: string }[] = [
  { id: "and", label: "and" },
  { id: "or", label: "or" },
];

const CONTENT_FLAGS = [
  { id: "citations", label: "citations / artifacts" },
  { id: "notes", label: "notes" },
  { id: "comments", label: "comments" },
] as const;

function FilterChecksDropdown({
  label,
  summary,
  size,
  disabled = false,
  children,
}: {
  label: string;
  summary: string;
  size: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  if (disabled && open) setOpen(false);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return;
    }
    const node = rootRef.current;
    function place() {
      const rect = node.getBoundingClientRect();
      const width = rect.width;
      const height = Math.min(18 * 16, window.innerHeight * 0.5, 8 + size * 34);
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - height);
      }
      setPos((current) =>
        current &&
        current.top === top &&
        current.left === left &&
        current.width === width
          ? current
          : { top, left, width },
      );
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, size, summary]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const path = event.composedPath();
      if (rootRef.current && path.includes(rootRef.current)) return;
      if (panelRef.current && path.includes(panelRef.current)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    function onScroll(event: Event) {
      const node = event.target;
      if (
        panelRef.current &&
        (node === panelRef.current ||
          (node instanceof Node && panelRef.current.contains(node)))
      ) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="filter-checks">
      <button
        type="button"
        className="app-field filter-checks-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={summary ? `${label}: ${summary}` : label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{summary}</span>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              className="filter-checks-panel"
              role="dialog"
              aria-label={label}
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              {children}
            </div>,
            portalRoot(),
          )
        : null}
    </div>
  );
}

function MatchToggle<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="view-toggle filter-bool" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? "is-active" : undefined}
          aria-pressed={value === option.id}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DateViewSelect({
  datePeriod,
  dateViews,
  dateCursor,
  overviewPeriod,
  onChange,
}: {
  datePeriod: SearchDatePeriod;
  dateViews: string[];
  dateCursor: string;
  overviewPeriod: Period | null;
  onChange: (next: string) => void;
}) {
  const current = dateViews.includes(dateCursor) ? dateCursor : dateViews[0];
  const weekFace = datePeriod === "week" ? weekLabelParts(current) : null;
  const options = dateViews.map((value) => {
    const week = datePeriod === "week" ? weekLabelParts(value) : null;
    const label = week
      ? `${week.start}\n${week.end}`
      : overviewPeriod
        ? periodLabel(overviewPeriod, value)
        : value;
    return (
      <option key={value} value={value}>
        {label}
      </option>
    );
  });
  const select = (
    <select
      className={
        weekFace ? "app-select week-select-control" : "app-field app-select"
      }
      aria-label="View"
      value={current}
      onChange={(event) => onChange(event.target.value)}
    >
      {options}
    </select>
  );
  if (!weekFace) return select;
  return (
    <div className="app-field app-select is-multiline week-select">
      <div className="week-select-face" aria-hidden="true">
        <span>{weekFace.start}</span>
        <span className="select-break">{weekFace.end}</span>
      </div>
      {select}
    </div>
  );
}

function highlightQuery(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <strong key={index}>{part}</strong>
    ) : (
      part
    ),
  );
}

const PAGE_SIZE = 10;

const DISABLED_CHAT: ChatMsg[] = [
  {
    id: "bot-disabled",
    role: "bot",
    parts: [CHIVEBOT_DISABLED_COPY],
    action: { href: CHIVEBOT_DOCS_HREF, label: "Enable Chatbot" },
  },
];

const EMPTY_CHAT: ChatMsg[] = [
  {
    id: "bot-empty",
    role: "bot",
    parts: ["No messages yet."],
  },
];

function fromServerMessage(message: ChivebotChatMessage): ChatMsg {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "bot",
    content: message.content,
    parts: parseChatParts(message.content),
  };
}

function errorChatMessage(kind: "quota" | "error"): ChatMsg {
  return {
    id: `bot-error-${Date.now()}`,
    role: "bot",
    parts: [kind === "quota" ? CHIVEBOT_QUOTA_COPY : CHIVEBOT_ERROR_COPY],
    error: kind,
  };
}

type SearchHit = {
  orgId: string;
  iso: string;
  section: string;
  snippet: string;
  rowId?: string;
  score: number;
};

type SearchSort =
  | "most-relevant"
  | "least-relevant"
  | "most-recent"
  | "least-recent";

function needleCount(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

function hitTieBreak(a: SearchHit, b: SearchHit) {
  return (
    a.orgId.localeCompare(b.orgId) ||
    a.section.localeCompare(b.section) ||
    (a.rowId ?? "").localeCompare(b.rowId ?? "")
  );
}

function matchesMode<T>(selected: T[], value: T, mode: MatchMode) {
  if (selected.length === 0) return true;
  const included = selected.includes(value);
  return mode === "is" ? included : !included;
}

function dayHasContent(day: DayEntry, flag: string) {
  if (flag === "notes") return Boolean(day.notes.trim());
  if (flag === "comments") return Boolean(day.comments.trim());
  if (flag === "citations" || flag === "artifacts") {
    return day.artifacts.length > 0;
  }
  return false;
}

function matchesContents(
  day: DayEntry,
  flags: string[],
  mode: ContainMode,
  combine: CombineMode,
) {
  if (flags.length === 0) return true;
  const present = flags.map((flag) => dayHasContent(day, flag));
  const checks = mode === "contains" ? present : present.map((value) => !value);
  return combine === "or" ? checks.some(Boolean) : checks.every(Boolean);
}

function snippetHits(
  org: Org,
  iso: string,
  day: DayEntry,
  needle: string,
): SearchHit[] {
  const hits: SearchHit[] = [];
  const n = needle.toLowerCase();
  const extra = `${org.name} ${formatDayTitle(iso)}`.toLowerCase();
  // Occurrence × field weight. Work title 4, notes and other field text 2,
  // org name / day title 1 so extra-haystack-only matches rank lower.
  const WEIGHT_WORK_TITLE = 4;
  const WEIGHT_FIELD = 2;
  const WEIGHT_EXTRA = 1;
  function fieldScore(text: string, weight: number) {
    return needleCount(text.toLowerCase(), n) * weight;
  }
  function push(
    section: string,
    snippet: string,
    rowId?: string,
    work?: { title: string; rest: string },
  ) {
    const haystack = `${extra} ${section} ${snippet}`.toLowerCase();
    if (!haystack.includes(n)) return;
    const score =
      (work
        ? fieldScore(work.title, WEIGHT_WORK_TITLE) +
          fieldScore(work.rest, WEIGHT_FIELD)
        : fieldScore(snippet, WEIGHT_FIELD)) +
      fieldScore(extra, WEIGHT_EXTRA);
    hits.push({ orgId: org.id, iso, section, snippet, rowId, score });
  }
  if (day.notes) push("Notes", day.notes);
  if (day.comments) push("Comments", day.comments);
  for (const row of day.work) {
    push(
      "Work Completed",
      [row.title, row.description, row.link].filter(Boolean).join(". "),
      row.id,
      {
        title: row.title,
        rest: [row.description, row.link].filter(Boolean).join(" "),
      },
    );
  }
  for (const row of day.artifacts) {
    push(
      "Citations / Artifacts",
      [row.title, row.url, row.attachment].filter(Boolean).join(". "),
      row.id,
    );
  }
  if (day.attendance) {
    const attendance =
      ATTENDANCE_OPTIONS.find((option) => option.id === day.attendance)
        ?.label ?? day.attendance;
    push("Attendance", attendance);
  }
  const face = RATING_FACES.find((item) => item.value === day.rating);
  if (face) push("Rating", `${face.face} ${face.label}`);
  return hits;
}

function collectHits(
  catalog: Org[],
  days: Record<string, Record<string, DayEntry>>,
  needle: string,
  filters: {
    orgs: string[];
    orgMode: MatchMode;
    dateMode: MatchMode;
    archiveStart: string;
    today: string;
    from: string;
    to: string;
    attendance: string[];
    attendanceMode: MatchMode;
    rating: number[];
    ratingMode: MatchMode;
    has: string[];
    hasMode: ContainMode;
    hasCombine: CombineMode;
  },
): SearchHit[] {
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const org of catalog) {
    if (!matchesMode(filters.orgs, org.id, filters.orgMode)) continue;
    const orgDays = days[org.id] ?? {};
    const { minIso, maxIso } = orgRange(org, filters.archiveStart, filters.today);
    for (const [iso, day] of Object.entries(orgDays)) {
      if (iso < minIso || iso > maxIso) continue;
      if (filters.from || filters.to) {
        const inside =
          (!filters.from || iso >= filters.from) &&
          (!filters.to || iso <= filters.to);
        if (filters.dateMode === "is" ? !inside : inside) continue;
      }
      // "is not" keeps unrated days and days with unset attendance.
      if (
        !matchesMode(
          filters.attendance,
          day.attendance ?? "",
          filters.attendanceMode,
        )
      ) {
        continue;
      }
      if (
        day.rating != null &&
        !matchesMode(filters.rating, day.rating, filters.ratingMode)
      ) {
        continue;
      }
      if (filters.rating.length > 0 && day.rating == null && filters.ratingMode === "is") {
        continue;
      }
      if (
        !matchesContents(day, filters.has, filters.hasMode, filters.hasCombine)
      ) {
        continue;
      }
      hits.push(...snippetHits(org, iso, day, needle));
    }
  }
  return hits;
}

function renderInline(parts: ChatInline[], key: string): ReactNode[] {
  return parts.map((part, index) => {
    const id = `${key}-${index}`;
    if (typeof part === "string") {
      return <span key={id}>{part}</span>;
    }
    if ("href" in part) {
      return (
        <Link key={id} href={part.href}>
          {part.label}
        </Link>
      );
    }
    if ("strong" in part) {
      return <strong key={id}>{renderInline(part.strong, id)}</strong>;
    }
    return <em key={id}>{renderInline(part.em, id)}</em>;
  });
}

function renderMarkdownBlocks(blocks: ChatBlock[], key: string) {
  return blocks.map((block, index) => {
    const id = `${key}-b${index}`;
    if (block.type === "p") {
      return <p key={id}>{renderInline(block.children, id)}</p>;
    }
    const List = block.type === "ol" ? "ol" : "ul";
    return (
      <List key={id}>
        {block.items.map((item, itemIndex) => (
          <li key={`${id}-${itemIndex}`}>{renderInline(item, `${id}-${itemIndex}`)}</li>
        ))}
      </List>
    );
  });
}

function renderChatParts(message: ChatMsg, dayLinks: ArchiveDayLink[]) {
  const source =
    message.role === "bot" && message.content
      ? linkArchiveDays(message.content, dayLinks)
      : null;
  if (source) return renderMarkdownBlocks(parseChatMarkdown(source), message.id);
  const parts = message.parts ?? [];
  return (
    <p>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={`${message.id}-${index}`}>{part}</span>
        ) : (
          <Link key={`${message.id}-${index}`} href={part.href}>
            {part.label}
          </Link>
        ),
      )}
    </p>
  );
}

export function SearchShell() {
  const { status, settings, days } = useDemo();
  const dbError = status === "error";
  const today = todayIso(undefined, settings.timezone);
  const catalog = useMemo(
    () => (dbError ? [] : settings.orgs),
    [dbError, settings.orgs],
  );
  const dayLinks = useMemo(
    () => archiveDayLinks(catalog, days, settings.archiveStartDate, today),
    [catalog, days, settings.archiveStartDate, today],
  );
  const addHref =
    !dbError && catalog.length === 0 ? organizationAddHref() : undefined;
  const showEmptyState = !dbError && catalog.length === 0;
  const noOrgs = catalog.length === 0;
  const chatPanelOff = flags.chivebot && catalog.length === 0;
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgMode, setOrgMode] = useState<MatchMode>("is");
  const [showHidden, setShowHidden] = useState(false);
  const [orgStatus, setOrgStatus] = useState<OrgStatusFilter>("all");
  const [datePeriod, setDatePeriod] = useState<SearchDatePeriod>("all");
  const [dateCursor, setDateCursor] = useState(today);
  const [dateMode, setDateMode] = useState<MatchMode>("is");
  const [from, setFrom] = useState(settings.archiveStartDate);
  const [to, setTo] = useState(today);
  const [attendance, setAttendance] = useState<string[]>([]);
  const [attendanceMode, setAttendanceMode] = useState<MatchMode>("is");
  const [rating, setRating] = useState<number[]>([]);
  const [ratingMode, setRatingMode] = useState<MatchMode>("is");
  const [has, setHas] = useState<string[]>([]);
  const [hasMode, setHasMode] = useState<ContainMode>("contains");
  const [hasCombine, setHasCombine] = useState<CombineMode>("and");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAvailable, setChatAvailable] = useState(flags.chivebot);
  const [chatChecked, setChatChecked] = useState(!flags.chivebot);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatRetrieving, setChatRetrieving] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(
    flags.chivebot ? [] : DISABLED_CHAT,
  );
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const chatEpochRef = useRef(0);
  const [page, setPage] = useState(0);
  const [pagedQuery, setPagedQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SearchSort>("most-relevant");
  const [chatOpen, setChatOpen] = useState(false);

  function onShowHidden(next: boolean) {
    setShowHidden(next);
    if (next) return;
    const hiddenIds = new Set(
      catalog.filter((org) => org.hidden).map((org) => org.id),
    );
    setOrgs((current) => current.filter((id) => !hiddenIds.has(id)));
  }

  function onOrgStatus(next: OrgStatusFilter) {
    setOrgStatus(next);
    if (next === "all") return;
    setOrgs((current) =>
      current.filter((id) => {
        const org = catalog.find((item) => item.id === id);
        return org ? orgMatchesStatus(org, next, today) : false;
      }),
    );
  }

  function toggleOrg(id: string) {
    setOrgs((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleHas(flag: string) {
    setHas((current) =>
      current.includes(flag)
        ? current.filter((item) => item !== flag)
        : [...current, flag],
    );
  }

  function toggleAttendance(id: string) {
    setAttendance((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleRating(value: number) {
    setRating((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function filtersActive() {
    return (
      orgs.length > 0 ||
      orgMode !== "is" ||
      showHidden ||
      orgStatus !== "all" ||
      datePeriod !== "all" ||
      attendance.length > 0 ||
      attendanceMode !== "is" ||
      rating.length > 0 ||
      ratingMode !== "is" ||
      has.length > 0 ||
      hasMode !== "contains" ||
      hasCombine !== "and"
    );
  }

  function clearFilters() {
    setOrgs([]);
    setOrgMode("is");
    setShowHidden(false);
    setOrgStatus("all");
    setDatePeriod("all");
    setDateCursor(today);
    setDateMode("is");
    setFrom(settings.archiveStartDate);
    setTo(today);
    setAttendance([]);
    setAttendanceMode("is");
    setRating([]);
    setRatingMode("is");
    setHas([]);
    setHasMode("contains");
    setHasCombine("and");
    setPage(0);
  }

  useEffect(() => {
    if (dbError || !flags.chivebot) return;
    let cancelled = false;
    void loadChivebotChat()
      .then((result) => {
        if (cancelled) return;
        setChatAvailable(result.available);
        setChatChecked(true);
        setChatMessages(
          result.available
            ? result.messages.map(fromServerMessage)
            : DISABLED_CHAT,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setChatAvailable(false);
        setChatChecked(true);
        setChatMessages(DISABLED_CHAT);
      });
    return () => {
      cancelled = true;
    };
  }, [dbError]);

  function sendChat() {
    const text = chatDraft.trim();
    if (dbError || !text || !chatAvailable || chatBusy) return;
    const stamp = Date.now();
    const userMessage: ChatMsg = {
      id: `user-${stamp}`,
      role: "user",
      parts: [text],
    };
    setChatMessages((current) => [
      ...current.filter((message) => message.id !== "bot-disabled"),
      userMessage,
    ]);
    setChatDraft("");
    setChatBusy(true);
    setChatRetrieving(true);
    const epoch = chatEpochRef.current;
    void sendChivebotMessage(text)
      .then((result) => {
        if (epoch !== chatEpochRef.current) return;
        setChatBusy(false);
        setChatRetrieving(false);
        if (result.ok) {
          setChatMessages((current) => [
            ...current,
            fromServerMessage(result.message),
          ]);
          return;
        }
        if (result.error === "connect") {
          setChatAvailable(false);
          setChatMessages(DISABLED_CHAT);
          return;
        }
        setChatMessages((current) => [
          ...current,
          errorChatMessage(result.error === "quota" ? "quota" : "error"),
        ]);
      })
      .catch(() => {
        if (epoch !== chatEpochRef.current) return;
        setChatBusy(false);
        setChatRetrieving(false);
        setChatMessages((current) => [...current, errorChatMessage("error")]);
      });
  }

  function clearChat() {
    if (!chatAvailable) return;
    chatEpochRef.current += 1;
    setChatDraft("");
    setChatRetrieving(false);
    setChatBusy(false);
    setChatMessages([]);
    void clearChivebotChat()
      .then((result) => {
        setChatAvailable(result.available);
        if (!result.available) setChatMessages(DISABLED_CHAT);
      })
      .catch(() => {
        setChatMessages([]);
      });
  }

  function onChatSubmit(event: FormEvent) {
    event.preventDefault();
    sendChat();
  }

  function onChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  }

  useEffect(() => {
    const node = chatHistoryRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatRetrieving]);

  const needle = query.trim();
  const visibleCatalog = filterOrgList(catalog, {
    showHidden,
    orgStatus,
    today,
  });
  const dateViews = useMemo(() => {
    const period = asPeriod(datePeriod);
    if (!period) return [];
    const merged: Record<string, DayEntry> = {};
    for (const org of visibleCatalog) {
      if (!matchesMode(orgs, org.id, orgMode)) continue;
      const { minIso, maxIso } = orgRange(org, settings.archiveStartDate, today);
      for (const [iso, day] of Object.entries(days[org.id] ?? {})) {
        if (iso >= minIso && iso <= maxIso) merged[iso] = day;
      }
    }
    return viewCursors(period, merged, today);
  }, [
    datePeriod,
    visibleCatalog,
    orgs,
    orgMode,
    days,
    today,
    settings.archiveStartDate,
  ]);

  // Duration is a manual range, floored only at Archive Start. A range that
  // misses Date Active through the day before Date Inactive can return nothing.
  const startFloor =
    settings.archiveStartDate && settings.archiveStartDate <= today
      ? settings.archiveStartDate
      : "";
  let nextTo = to > today ? today : to;
  let nextFrom = from;
  if (startFloor) {
    if (nextTo && nextTo < startFloor) nextTo = startFloor;
    if (!nextFrom || nextFrom < startFloor) nextFrom = startFloor;
  }
  if (nextFrom && nextFrom > nextTo) nextFrom = nextTo;
  if (nextTo !== to) setTo(nextTo);
  if (nextFrom !== from) setFrom(nextFrom);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateCursor) && dateCursor > today) {
    setDateCursor(today);
  }

  const overviewPeriod = asPeriod(datePeriod);
  if (overviewPeriod && dateViews.length > 0) {
    if (overviewPeriod === "rolling") {
      if (!dateViews.includes(dateCursor)) setDateCursor(dateViews[0]);
    } else {
      const canonical = /^\d{4}-\d{2}-\d{2}$/.test(dateCursor)
        ? periodRange(overviewPeriod, dateCursor, today).start
        : "";
      if (canonical && dateViews.includes(canonical) && dateCursor !== canonical) {
        setDateCursor(canonical);
      } else if (!dateViews.includes(dateCursor)) {
        setDateCursor(dateViews[0]);
      }
    }
  }

  const dateWindow = overviewPeriod
    ? periodRange(overviewPeriod, dateCursor, today)
    : datePeriod === "duration"
      ? durationWindow(nextFrom, nextTo)
      : { start: "", end: "" };

  const hits = collectHits(visibleCatalog, days, needle, {
    orgs,
    orgMode,
    dateMode: datePeriod === "all" ? "is" : dateMode,
    archiveStart: settings.archiveStartDate,
    today,
    from: dateWindow.start,
    to: dateWindow.end,
    attendance,
    attendanceMode,
    rating,
    ratingMode,
    has,
    hasMode,
    hasCombine,
  });
  if (query !== pagedQuery) {
    setPagedQuery(query);
    setPage(0);
  }

  const sortedHits = [...hits].sort((a, b) => {
    const byIso =
      sortOrder === "least-relevant" || sortOrder === "least-recent"
        ? a.iso.localeCompare(b.iso)
        : b.iso.localeCompare(a.iso);
    if (sortOrder === "most-relevant" || sortOrder === "least-relevant") {
      const byScore =
        sortOrder === "least-relevant" ? a.score - b.score : b.score - a.score;
      return byScore || byIso || hitTieBreak(a, b);
    }
    return byIso || hitTieBreak(a, b);
  });
  const pageCount = Math.max(1, Math.ceil(sortedHits.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageHits = sortedHits.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  useEffect(() => {
    if (!chatOpen) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setChatOpen(false);
    }
    function onResize() {
      if (window.innerWidth > 900) setChatOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [chatOpen]);

  function renderSort() {
    return (
      <label className="date-range-field search-sort">
        <span className="date-range-label">Sort</span>
        <select
          className="app-field app-select"
          value={sortOrder}
          disabled={dbError}
          onChange={(event) => {
            setSortOrder(event.target.value as SearchSort);
            setPage(0);
          }}
        >
          <option value="most-relevant">most relevant</option>
          <option value="least-relevant">least relevant</option>
          <option value="most-recent">most recent</option>
          <option value="least-recent">least recent</option>
        </select>
      </label>
    );
  }

  function renderFilters() {
    const listedOrgs = sortOrgs(visibleCatalog, "az");
    return (
      <>
        <fieldset className="filter-set">
          <legend>Organizations</legend>
          <OrgStatusSelect value={orgStatus} onChange={onOrgStatus} />
          <HiddenToggle showHidden={showHidden} onShowHidden={onShowHidden} />
          <MatchToggle
            label="Organizations"
            value={orgMode}
            onChange={setOrgMode}
            options={IS_OPTIONS}
          />
          <FilterChecksDropdown
            label="Organizations"
            size={Math.max(listedOrgs.length, 1)}
            disabled={dbError}
            summary={listedOrgs
              .filter((org) => orgs.includes(org.id))
              .map((org) => org.name)
              .join(", ")}
          >
            {listedOrgs.map((org) => (
              <label key={org.id}>
                <input
                  type="checkbox"
                  checked={orgs.includes(org.id)}
                  onChange={() => toggleOrg(org.id)}
                />
                {org.name}
              </label>
            ))}
          </FilterChecksDropdown>
        </fieldset>
        <fieldset className="filter-set">
          <legend>Date Range</legend>
          <MatchToggle
            label="Date Range"
            value={datePeriod === "all" ? "is" : dateMode}
            onChange={setDateMode}
            options={IS_OPTIONS}
            disabled={datePeriod === "all"}
          />
          <select
            className="app-field app-select"
            aria-label="Date Range"
            value={datePeriod}
            onChange={(event) => {
              const next = event.target.value as SearchDatePeriod;
              setDatePeriod(next);
              if (next === "all") setDateMode("is");
            }}
          >
            <option value="all">All Time</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="rolling">Rolling</option>
            <option value="duration">Duration</option>
          </select>
          {datePeriod === "all" ||
          datePeriod === "duration" ||
          dateViews.length === 0 ? null : (
            <DateViewSelect
              datePeriod={datePeriod}
              dateViews={dateViews}
              dateCursor={dateCursor}
              overviewPeriod={overviewPeriod}
              onChange={setDateCursor}
            />
          )}
          {datePeriod === "duration" ? (
            <div className="date-range">
              <div className="date-range-field">
                <span className="date-range-label">From</span>
                <ThemeDateField
                  className="app-date"
                  aria-label="From date"
                  value={from}
                  min={startFloor || undefined}
                  until={to || undefined}
                  today={today}
                  onChange={setFrom}
                />
              </div>
              <div className="date-range-field">
                <span className="date-range-label">To</span>
                <ThemeDateField
                  className="app-date"
                  aria-label="To date"
                  value={to}
                  min={from || startFloor || undefined}
                  today={today}
                  onChange={setTo}
                />
              </div>
            </div>
          ) : null}
        </fieldset>
        <fieldset className="filter-set">
          <legend>Attendance</legend>
          <MatchToggle
            label="Attendance"
            value={attendanceMode}
            onChange={setAttendanceMode}
            options={IS_OPTIONS}
          />
          <FilterChecksDropdown
            label="Attendance"
            size={ATTENDANCE_OPTIONS.length}
            disabled={dbError}
            summary={ATTENDANCE_OPTIONS.filter((option) =>
              attendance.includes(option.id),
            )
              .map((option) => option.label)
              .join(", ")}
          >
            {ATTENDANCE_OPTIONS.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={attendance.includes(option.id)}
                  onChange={() => toggleAttendance(option.id)}
                />
                {option.label}
              </label>
            ))}
          </FilterChecksDropdown>
        </fieldset>
        <fieldset className="filter-set">
          <legend>Rating</legend>
          <MatchToggle
            label="Rating"
            value={ratingMode}
            onChange={setRatingMode}
            options={IS_OPTIONS}
          />
          <FilterChecksDropdown
            label="Rating"
            size={RATING_FACES.length}
            disabled={dbError}
            summary={RATING_FACES.filter((face) => rating.includes(face.value))
              .map((face) => `${face.face} ${face.label}`)
              .join(", ")}
          >
            {RATING_FACES.map((face) => (
              <label key={face.value}>
                <input
                  type="checkbox"
                  checked={rating.includes(face.value)}
                  onChange={() => toggleRating(face.value)}
                />
                {face.face} {face.label}
              </label>
            ))}
          </FilterChecksDropdown>
        </fieldset>
        <fieldset className="filter-set">
          <legend>Contents</legend>
          <div className="filter-modes">
            <MatchToggle
              label="Contents"
              value={hasMode}
              onChange={setHasMode}
              options={CONTAIN_OPTIONS}
            />
            <MatchToggle
              label="Combine contents"
              value={hasCombine}
              onChange={setHasCombine}
              options={COMBINE_OPTIONS}
            />
          </div>
          <FilterChecksDropdown
            label="Contents"
            size={CONTENT_FLAGS.length}
            disabled={dbError}
            summary={CONTENT_FLAGS.filter((flag) => has.includes(flag.id))
              .map((flag) => flag.label)
              .join(", ")}
          >
            {CONTENT_FLAGS.map((flag) => (
              <label key={flag.id}>
                <input
                  type="checkbox"
                  checked={has.includes(flag.id)}
                  onChange={() => toggleHas(flag.id)}
                />
                {flag.label}
              </label>
            ))}
          </FilterChecksDropdown>
        </fieldset>
        <button
          type="button"
          className="text-link search-clear-filters"
          disabled={!filtersActive()}
          onClick={clearFilters}
        >
          clear all filters
        </button>
      </>
    );
  }

  function renderChat() {
    const chatLoadingHistory = !dbError && flags.chivebot && !chatChecked;
    const shownMessages = dbError ? DISABLED_CHAT : chatMessages;
    const historyMessages =
      shownMessages.length === 0 && !chatRetrieving ? EMPTY_CHAT : shownMessages;
    const chatCentered =
      dbError ||
      chatLoadingHistory ||
      (historyMessages.length === 1 &&
        (historyMessages[0]?.id === "bot-disabled" ||
          historyMessages[0]?.id === "bot-empty"));
    const composeOn =
      !dbError &&
      chatAvailable &&
      flags.chivebot &&
      chatChecked &&
      catalog.length > 0;
    return (
      <div className="search-chat">
        <div
          ref={chatHistoryRef}
          className={`search-chat-history${chatCentered ? " is-centered" : ""}`}
        >
          {chatLoadingHistory ? (
            <p
              className="search-chat-retrieving"
              role="status"
              aria-live="polite"
            >
              Loading chat ...
            </p>
          ) : (
            <ul className="search-chat-log">
              {historyMessages.map((message) => (
                <li
                  key={message.id}
                  className={`search-chat-msg is-${message.role}${message.error ? " is-error" : ""}`}
                >
                  <span className="search-chat-role">
                    {message.role === "user" ? "You" : "ChiveBot"}
                  </span>
                  <div
                    className="search-chat-text"
                    role={message.error ? "alert" : undefined}
                  >
                    {renderChatParts(message, dayLinks)}
                  </div>
                  {message.action ? (
                    <a
                      href={message.action.href}
                      className="plus-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {message.action.label}
                    </a>
                  ) : null}
                </li>
              ))}
              {chatRetrieving ? (
                <li className="search-chat-msg is-bot">
                  <span className="search-chat-role">ChiveBot</span>
                  <p
                    className="search-chat-retrieving"
                    role="status"
                    aria-live="polite"
                  >
                    Retrieving answers ...
                  </p>
                </li>
              ) : null}
            </ul>
          )}
        </div>
        <form
          className={`search-chat-compose-wrap${composeOn ? "" : " is-inert"}`}
          onSubmit={onChatSubmit}
          inert={!composeOn || undefined}
        >
          <div className="search-chat-compose">
            <label>
              <span className="sr-only">Message</span>
              <textarea
                rows={2}
                placeholder="Ask ChiveBot about your archive entries ..."
                value={chatDraft}
                disabled={!composeOn || chatBusy}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={onChatKeyDown}
              />
            </label>
          </div>
          <div className="day-form-actions">
            <button
              type="button"
              className="text-link"
              disabled={
                !composeOn ||
                chatMessages.length === 0 ||
                (chatMessages.length === 1 &&
                  chatMessages[0]?.id === "bot-disabled")
              }
              onClick={clearChat}
            >
              Clear Chat
            </button>
            <button
              type="submit"
              className="text-btn"
              disabled={!composeOn || chatBusy || !chatDraft.trim()}
            >
              Send
            </button>
          </div>
        </form>
      </div>
    );
  }

  function enableChatbot() {
    return (
      <a
        href={CHIVEBOT_DOCS_HREF}
        className="plus-btn"
        target="_blank"
        rel="noopener noreferrer"
      >
        Enable Chatbot
      </a>
    );
  }

  function askChiveBot() {
    return (
      <button
        type="button"
        className="text-btn"
        disabled={chatPanelOff}
        onClick={() => setChatOpen(true)}
      >
        ? Ask ChiveBot
      </button>
    );
  }

  function chatCallout() {
    if (!flags.chivebot || (chatChecked && !chatAvailable)) {
      return enableChatbot();
    }
    return askChiveBot();
  }

  return (
      <div className="page-cols">
        <div className="org-layout">
          <aside
            className={`org-sidebar${dbError || noOrgs ? " is-inert" : ""}`}
            aria-label="Search filters"
            inert={dbError || noOrgs || undefined}
          >
            {renderFilters()}
          </aside>
          <section
            className={`org-day${needle ? "" : " org-day-empty"}`}
            aria-label="Search"
          >
            <header className="day-heading search-heading">
              <div
                className={`search-heading-tools${dbError ? " is-inert" : ""}`}
                inert={dbError || undefined}
              >
                <label className="search-query">
                  <span className="sr-only">Search query</span>
                  <input
                    className="app-field"
                    type="search"
                    placeholder="Search Keywords"
                    value={query}
                    disabled={dbError}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query ? (
                    <button
                      type="button"
                      className="search-query-clear"
                      aria-label="Clear"
                      disabled={dbError}
                      onClick={() => setQuery("")}
                    >
                      <svg
                        width="16"
                        height="16"
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
                  ) : null}
                </label>
                {renderSort()}
              </div>
              <h1 className="page-title">Search</h1>
            </header>
            <div className="org-day-body">
              {needle && !dbError && !showEmptyState ? (
                <div className="org-add-inline">{chatCallout()}</div>
              ) : null}
              {dbError ? (
                <ErrorBody />
              ) : showEmptyState ? (
                <EmptyBody
                  copy="No organization archive data."
                  action={
                    <span className="page-state-actions">
                      {addHref ? (
                        <AddOrganizationLink href={addHref} />
                      ) : null}
                      <span className="org-add-inline">{chatCallout()}</span>
                    </span>
                  }
                />
              ) : needle ? (
                <>
                  <article className="col-copy day-panel search-results">
                    {pageHits.length ? (
                      pageHits.map((hit, index) => {
                        const org = settings.orgs.find(
                          (item) => item.id === hit.orgId,
                        );
                        return (
                          <section
                            key={`${hit.orgId}-${hit.iso}-${hit.section}-${hit.rowId ?? index}`}
                            className="day-section is-active"
                          >
                            <Link
                              href={archiveDayHref(hit.orgId, hit.iso)}
                              className="search-hit"
                            >
                              <h3>{org?.name ?? hit.orgId}</h3>
                              <p className="overview-entry-date">
                                {formatDayTitle(hit.iso)} · {hit.section}
                              </p>
                              <p>{highlightQuery(hit.snippet, query)}</p>
                            </Link>
                          </section>
                        );
                      })
                    ) : (
                      <p className="empty-inline">No search results.</p>
                    )}
                  </article>
                  {hits.length > PAGE_SIZE ? (
                    <nav className="search-pager" aria-label="Search pages">
                      <button
                        type="button"
                        className="pager-btn"
                        disabled={safePage === 0}
                        aria-label="Previous"
                        onClick={() => setPage((current) => Math.max(0, current - 1))}
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
                      <span className="search-pager-status">
                        {safePage + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        className="pager-btn"
                        disabled={safePage >= pageCount - 1}
                        aria-label="Next"
                        onClick={() =>
                          setPage((current) => Math.min(pageCount - 1, current + 1))
                        }
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
                  ) : null}
                </>
              ) : (
                <div className="search-empty-stack">
                  <p className="org-empty-prompt search-empty-prompt">
                    {
                      "Results run from each organization's Date Active through the day before Date Inactive, and not before Archive Start."
                    }
                  </p>
                  <div className="org-add-inline">{chatCallout()}</div>
                </div>
              )}
            </div>
          </section>
          <section
            className={`org-filters${chatPanelOff ? " is-inert" : ""}`}
            aria-label="Chatbot"
            inert={chatPanelOff || undefined}
          >
            {renderChat()}
          </section>
        </div>
        <MobileFilters
          disabled={dbError || noOrgs}
          label="filter results"
        >
          {renderFilters()}
        </MobileFilters>
        {!dbError && flags.chivebot && chatAvailable && chatOpen && !chatPanelOff ? (
          <ModalShell
            className="search-chat-overlay"
            onClose={() => setChatOpen(false)}
          >
            <div
              className="search-chat-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chivebot-title"
            >
              <header className="search-chat-sheet-head">
                <h2 id="chivebot-title">ChiveBot</h2>
                <button
                  type="button"
                  className="icon-btn search-chat-close"
                  aria-label="Close"
                  onClick={() => setChatOpen(false)}
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
              {renderChat()}
            </div>
          </ModalShell>
        ) : null}
      </div>
  );
}
