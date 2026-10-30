import {
  formatDayTitle,
  orgRange,
  TODAY,
  type DayEntry,
  type Org,
} from "./data";
import { archiveDayHref } from "./paths";

export const CHIVEBOT_DOCS_HREF = "https://career-chive.vercel.app/docs/chatbot";

export const CHIVEBOT_DISABLED_COPY =
  "ChiveBot is either disabled or cannot connect.";

export const CHIVEBOT_QUOTA_COPY =
  "ChiveBot hit the Gemini quota or rate limit. Try again later.";

export const CHIVEBOT_ERROR_COPY = "ChiveBot could not answer. Try again.";

export type ChatPart = string | { href: string; label: string };

export type ChatInline =
  | string
  | { href: string; label: string }
  | { strong: ChatInline[] }
  | { em: ChatInline[] };

export type ChatBlock =
  | { type: "p"; children: ChatInline[] }
  | { type: "ul"; items: ChatInline[][] }
  | { type: "ol"; items: ChatInline[][] };

export const HIDDEN_ORG_NOTE = "hidden organization";

export type ArchiveDayLink = {
  orgId: string;
  orgName: string;
  iso: string;
  href: string;
  title: string;
  hiddenNote?: string;
};

export function archiveDayLinks(
  orgs: Org[],
  days: Record<string, Record<string, DayEntry>>,
  archiveStartDate = "",
  today = TODAY,
): ArchiveDayLink[] {
  const links: ArchiveDayLink[] = [];
  for (const org of orgs) {
    const orgDays = days[org.id] ?? {};
    const { minIso, maxIso } = orgRange(org, archiveStartDate, today);
    for (const iso of Object.keys(orgDays)) {
      if (iso < minIso || iso > maxIso) continue;
      links.push({
        orgId: org.id,
        orgName: org.name,
        iso,
        href: `/?org=${encodeURIComponent(org.id)}&iso=${encodeURIComponent(iso)}`,
        title: formatDayTitle(iso),
        hiddenNote: org.hidden ? HIDDEN_ORG_NOTE : undefined,
      });
    }
  }
  return links;
}

function hrefIsComplete(href: string) {
  try {
    const url = new URL(href, "https://careerchive.local");
    const org = url.searchParams.get("org");
    const iso = url.searchParams.get("iso") ?? "";
    return Boolean(org && /^\d{4}-\d{2}-\d{2}$/.test(iso));
  } catch {
    return false;
  }
}

function dropTruncatedMarkdown(text: string) {
  const unclosedLink = text.match(/\[([^\]]+)\]\([^)]*$/);
  if (unclosedLink && unclosedLink.index != null) {
    return `${text.slice(0, unclosedLink.index)}${unclosedLink[1]}`;
  }
  const unclosedLabel = text.match(/\[[^\]]*$/);
  if (unclosedLabel && unclosedLabel.index != null) {
    return text.slice(0, unclosedLabel.index).replace(/[\s,]+$/, "");
  }
  return text;
}

function dayLinkLabel(day: ArchiveDayLink) {
  return `${day.orgName} · ${day.title}`;
}

function resolveDay(label: string, days: ArchiveDayLink[]) {
  const trimmed = label.trim();
  const withOrg = days.find((day) => dayLinkLabel(day) === trimmed);
  if (withOrg) return withOrg;
  const titled = days.filter((day) => day.title === trimmed);
  if (titled.length === 1) return titled[0];
  const contained = days.filter((day) => trimmed.includes(day.title));
  if (contained.length === 1) return contained[0];
  return titled[0];
}

function linkifyPlain(text: string, days: ArchiveDayLink[]) {
  if (!text) return text;
  const titleCount = new Map<string, number>();
  for (const day of days) {
    titleCount.set(day.title, (titleCount.get(day.title) ?? 0) + 1);
  }
  let out = text;
  const named = [...days].sort(
    (a, b) =>
      `${b.orgName} · ${b.title}`.length - `${a.orgName} · ${a.title}`.length,
  );
  for (const day of named) {
    const label = dayLinkLabel(day);
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), `[${label}](${day.href})`);
  }
  const titles = days
    .filter((day) => titleCount.get(day.title) === 1)
    .sort((a, b) => b.title.length - a.title.length);
  for (const day of titles) {
    const escaped = day.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(escaped, "g"),
      `[${dayLinkLabel(day)}](${day.href})`,
    );
  }
  return out;
}

function annotateHiddenDayLinks(text: string, days: ArchiveDayLink[]) {
  const hidden = days.filter((day) => day.hiddenNote);
  if (!hidden.length) return text;
  let out = text;
  for (const day of hidden) {
    const link = `[${dayLinkLabel(day)}](${day.href})`;
    const annotated = `${link} — ${day.hiddenNote}`;
    if (!out.includes(link) && !out.includes(annotated)) continue;
    out = out.split(annotated).join(link);
    out = out.split(link).join(annotated);
  }
  return out;
}

/** Close truncated markdown and turn day titles into Archive links. */
export function linkArchiveDays(text: string, days: ArchiveDayLink[]) {
  let body = dropTruncatedMarkdown(text);
  if (!days.length) return body;
  body = body.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_full, label, href) => {
    const day = resolveDay(label, days);
    if (day) return `[${dayLinkLabel(day)}](${day.href})`;
    if (hrefIsComplete(href)) return `[${label}](${String(href).trim()})`;
    return label;
  });
  const pieces: string[] = [];
  const splitter = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = splitter.exec(body))) {
    pieces.push(linkifyPlain(body.slice(last, match.index), days));
    pieces.push(match[0]);
    last = match.index + match[0].length;
  }
  pieces.push(linkifyPlain(body.slice(last), days));
  return annotateHiddenDayLinks(pieces.join(""), days);
}

export function rewriteChatHref(href: string) {
  try {
    const url = new URL(href, "https://careerchive.local");
    const org = url.searchParams.get("org");
    const iso = url.searchParams.get("iso");
    if (org && iso) return archiveDayHref(org, iso);
  } catch {
    /* keep href */
  }
  return href;
}

export function parseChatParts(text: string): ChatPart[] {
  const parts: ChatPart[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({
      href: rewriteChatHref(match[2].trim()),
      label: match[1],
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

/** Turn collapsed Gemini lists/headings into markdown the renderer can show. */
export function normalizeChatMarkdown(text: string) {
  let body = text.replace(/\r\n/g, "\n");
  body = body.replace(/\*\*([^*]+?):\*{2,}\s*/g, "**$1:**\n");
  body = body.replace(/([^\n])[ \t]*(\*\*[^*]+?:\*\*)/g, "$1\n\n$2");
  body = body.replace(
    /(\*\*[^*]+?:\*\*)[ \t]*[-*+]?\s*(?=\[[^\]]+\]\([^)]+\))/g,
    "$1\n- ",
  );
  body = body.replace(/[ \t]+-\s+(\[[^\]]+\]\([^)]+\))/g, "\n- $1");
  body = body.replace(/\n{3,}/g, "\n\n");
  return body.trim();
}

function parseInline(text: string): ChatInline[] {
  const out: ChatInline[] = [];
  const token = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1] != null) {
      out.push({
        href: rewriteChatHref(match[2].trim()),
        label: match[1],
      });
    } else if (match[3] != null) {
      out.push({ strong: parseInline(match[3]) });
    } else if (match[4] != null) {
      out.push({ em: parseInline(match[4]) });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

export function parseChatMarkdown(text: string): ChatBlock[] {
  const lines = normalizeChatMarkdown(text).split("\n");
  const blocks: ChatBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ").trim();
    if (joined) blocks.push({ type: "p", children: parseInline(joined) });
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: list.ordered ? "ol" : "ul",
      items: list.items.map((item) => parseInline(item)),
    });
    list = null;
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    if (numbered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export function citationTargets(text: string) {
  const found: { org: string; iso: string }[] = [];
  const seen = new Set<string>();
  const pattern = /\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    try {
      const url = new URL(match[1].trim(), "https://careerchive.local");
      const org = url.searchParams.get("org");
      const iso = url.searchParams.get("iso");
      if (!org || !iso) continue;
      const key = `${org}\0${iso}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ org, iso });
    } catch {
      /* skip */
    }
  }
  return found;
}
