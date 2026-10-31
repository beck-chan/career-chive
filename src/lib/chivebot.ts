import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTENDANCE_OPTIONS,
  RATING_FACES,
  formatDayTitle,
  loggingWindow,
  parseAttendance,
  todayIso,
  type DayEntry,
} from "./data";
import { HIDDEN_ORG_NOTE, type ArchiveDayLink } from "./chivebotChat";
import { flags } from "./flags";
import { embedText, embedTexts, isGeminiError } from "./gemini";

export const CHIVEBOT_SYSTEM_PROMPT =
  "You are ChiveBot for CareerChive. Answer only from the archive excerpts provided. Prefer a short paragraph. When you refer to a specific day, include an inline markdown link to that Archive day. Use bulleted lists if you need to link to more than three days. Only cite days from the excerpts; days before Archive Start, before Date Active, or on or after Date Inactive are not in this archive view. Questions about organizations use the organization list, which includes every organization even when it has no days in this archive view. If a day or organization is marked as a hidden organization, say that in the reply. If the excerpts do not contain the answer, say you could not find anything in the archive. Do not fabricate entries.";

export const CHIVEBOT_MATCH_COUNT = 16;
const EMBED_BATCH = 16;
const EMBED_CLIP = 8000;

export type ChivebotSection =
  | "notes"
  | "comments"
  | "attendance"
  | "rating"
  | "work_title"
  | "work_description"
  | "work_link"
  | "citation_title"
  | "citation_url"
  | "citation_filename";

export type ChivebotMatch = {
  id: string;
  section: string;
  source_id: string;
  organization_id: string;
  day_id: string;
  work_date: string;
  work_id: string | null;
  citation_id: string | null;
  content: string;
  similarity: number;
};

type DesiredEmbedding = {
  section: ChivebotSection;
  source_id: string;
  organization_id: string;
  day_id: string;
  work_date: string;
  work_id: string | null;
  citation_id: string | null;
  content: string;
};

function clip(text: string) {
  const trimmed = text.trim();
  return trimmed.length <= EMBED_CLIP ? trimmed : trimmed.slice(0, EMBED_CLIP);
}

export function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function sectionLabel(section: ChivebotSection) {
  switch (section) {
    case "notes":
      return "Notes";
    case "comments":
      return "Comments";
    case "attendance":
      return "Attendance";
    case "rating":
      return "Rating";
    case "work_title":
      return "Work Completed title";
    case "work_description":
      return "Work Completed description";
    case "work_link":
      return "Work Completed link";
    case "citation_title":
      return "Citations / Artifacts title";
    case "citation_url":
      return "Citations / Artifacts url";
    case "citation_filename":
      return "Citations / Artifacts filename";
  }
}

function fieldText(
  orgName: string,
  iso: string,
  section: ChivebotSection,
  value: string,
) {
  return clip(
    `${orgName} · ${formatDayTitle(iso)} · ${sectionLabel(section)}\n${value}`,
  );
}

function pushField(
  fields: DesiredEmbedding[],
  input: Omit<DesiredEmbedding, "content"> & { orgName: string; value: string },
) {
  const value = input.value.trim();
  if (!value) return;
  fields.push({
    section: input.section,
    source_id: input.source_id,
    organization_id: input.organization_id,
    day_id: input.day_id,
    work_date: input.work_date,
    work_id: input.work_id,
    citation_id: input.citation_id,
    content: fieldText(input.orgName, input.work_date, input.section, value),
  });
}

function fieldsFromDay(input: {
  orgId: string;
  orgName: string;
  iso: string;
  dayId: string;
  day: DayEntry;
}) {
  const fields: DesiredEmbedding[] = [];
  const base = {
    organization_id: input.orgId,
    day_id: input.dayId,
    work_date: input.iso,
    orgName: input.orgName,
  };
  pushField(fields, {
    ...base,
    section: "notes",
    source_id: input.dayId,
    work_id: null,
    citation_id: null,
    value: input.day.notes,
  });
  pushField(fields, {
    ...base,
    section: "comments",
    source_id: input.dayId,
    work_id: null,
    citation_id: null,
    value: input.day.comments,
  });
  if (input.day.attendance) {
    const attendance =
      ATTENDANCE_OPTIONS.find((option) => option.id === input.day.attendance)
        ?.label ?? input.day.attendance;
    pushField(fields, {
      ...base,
      section: "attendance",
      source_id: input.dayId,
      work_id: null,
      citation_id: null,
      value: attendance,
    });
  }
  const face = RATING_FACES.find((item) => item.value === input.day.rating);
  if (face) {
    pushField(fields, {
      ...base,
      section: "rating",
      source_id: input.dayId,
      work_id: null,
      citation_id: null,
      value: `${face.face} ${face.label}`,
    });
  }
  for (const row of input.day.work) {
    const workBase = {
      ...base,
      source_id: row.id,
      work_id: row.id,
      citation_id: null,
    };
    pushField(fields, { ...workBase, section: "work_title", value: row.title });
    pushField(fields, {
      ...workBase,
      section: "work_description",
      value: row.description,
    });
    pushField(fields, { ...workBase, section: "work_link", value: row.link });
  }
  for (const row of input.day.artifacts) {
    const citationBase = {
      ...base,
      source_id: row.id,
      work_id: null,
      citation_id: row.id,
    };
    pushField(fields, {
      ...citationBase,
      section: "citation_title",
      value: row.title,
    });
    pushField(fields, {
      ...citationBase,
      section: "citation_url",
      value: row.url,
    });
    pushField(fields, {
      ...citationBase,
      section: "citation_filename",
      value: row.attachment,
    });
  }
  return fields;
}

async function upsertEmbeddings(
  client: SupabaseClient,
  fields: DesiredEmbedding[],
  existing: Map<string, { content: string; hasEmbedding: boolean }>,
) {
  const pending: DesiredEmbedding[] = [];
  for (const field of fields) {
    const current = existing.get(`${field.section}\0${field.source_id}`);
    if (current?.content === field.content && current.hasEmbedding) continue;
    pending.push(field);
  }
  if (pending.length === 0) return;

  let vectors: Array<number[] | null> = pending.map(() => null);
  try {
    for (let index = 0; index < pending.length; index += EMBED_BATCH) {
      const slice = pending.slice(index, index + EMBED_BATCH);
      const embedded = await embedTexts(
        slice.map((field) => field.content),
        "RETRIEVAL_DOCUMENT",
      );
      embedded.forEach((vector, offset) => {
        vectors[index + offset] = vector;
      });
    }
  } catch (error) {
    if (isGeminiError(error)) {
      vectors = pending.map(() => null);
    } else {
      throw error;
    }
  }

  const rows = pending.map((field, index) => {
    const vector = vectors[index];
    return {
      section: field.section,
      source_id: field.source_id,
      organization_id: field.organization_id,
      day_id: field.day_id,
      work_date: field.work_date,
      work_id: field.work_id,
      citation_id: field.citation_id,
      content: field.content,
      embedding: vector ? toVectorLiteral(vector) : null,
    };
  });
  const { error } = await client.from("chivebot_entry_embedding").upsert(rows, {
    onConflict: "section,source_id",
  });
  if (error) throw error;
}

async function loadExisting(
  client: SupabaseClient,
  dayIds: string[],
) {
  const map = new Map<string, { content: string; hasEmbedding: boolean }>();
  if (!dayIds.length) return map;
  const { data, error } = await client
    .from("chivebot_entry_embedding")
    .select("section, source_id, content, embedding")
    .in("day_id", dayIds);
  if (error) throw error;
  for (const row of (data ?? []) as {
    section: string;
    source_id: string;
    content: string;
    embedding: unknown;
  }[]) {
    map.set(`${row.section}\0${row.source_id}`, {
      content: row.content ?? "",
      hasEmbedding: Boolean(row.embedding),
    });
  }
  return map;
}

export async function syncDayEmbeddings(
  client: SupabaseClient,
  input: {
    orgId: string;
    orgName: string;
    iso: string;
    dayId: string;
    day: DayEntry;
  },
) {
  if (!flags.chivebot) return;
  try {
    const desired = fieldsFromDay(input);
    const existing = await loadExisting(client, [input.dayId]);
    const keep = new Set(
      desired.map((field) => `${field.section}\0${field.source_id}`),
    );
    const drop = [...existing.keys()].filter((key) => !keep.has(key));
    if (drop.length) {
      for (const key of drop) {
        const [section, source_id] = key.split("\0");
        const { error } = await client
          .from("chivebot_entry_embedding")
          .delete()
          .eq("section", section)
          .eq("source_id", source_id);
        if (error) throw error;
      }
    }
    await upsertEmbeddings(client, desired, existing);
  } catch (error) {
    if (isGeminiError(error)) return;
    console.error(error);
  }
}

export async function deleteDayEmbeddings(
  client: SupabaseClient,
  dayIds: string[],
) {
  if (!dayIds.length) return;
  try {
    const { error } = await client
      .from("chivebot_entry_embedding")
      .delete()
      .in("day_id", dayIds);
    if (error) throw error;
  } catch (error) {
    console.error(error);
  }
}

export async function clearChivebotSessions(client: SupabaseClient) {
  try {
    const { error } = await client
      .from("chivebot_session")
      .delete()
      .not("id", "is", null);
    if (error) throw error;
  } catch (error) {
    console.error(error);
  }
}

// Content-free rows are described as empty logs, including a day created by
// hand or later cleared. The link lists stop at 80 of each kind.
const DAY_LIST_CAP = 80;

function filledSections(input: {
  notes: string;
  comments: string;
  attendance: ReturnType<typeof parseAttendance>;
  rating: number | null;
  workCount: number;
  citationCount: number;
}) {
  const sections: string[] = [];
  if (input.notes.trim()) sections.push("notes");
  if (input.comments.trim()) sections.push("comments");
  if (input.attendance) sections.push(`attendance ${input.attendance}`);
  const face = RATING_FACES.find((item) => item.value === input.rating);
  if (face) sections.push(`rating ${face.label}`);
  if (input.workCount) sections.push(`work ×${input.workCount}`);
  if (input.citationCount) sections.push(`citations ×${input.citationCount}`);
  return sections;
}

export async function loadArchiveOverview(client: SupabaseClient) {
  const orgNames = new Map<string, string>();
  const [orgsRes, daysRes, settingsRes] = await Promise.all([
    client
      .from("organizations")
      .select("id, name, date_active, date_inactive, hidden"),
    client
      .from("days")
      .select("id, organization_id, work_date, attendance, notes, rating, comments"),
    client
      .from("settings")
      .select("archive_start_date, timezone")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  if (daysRes.error) throw daysRes.error;
  if (settingsRes.error) throw settingsRes.error;
  const settingsRow = settingsRes.data as {
    archive_start_date?: string | null;
    timezone?: string | null;
  } | null;
  const archiveStart = String(settingsRow?.archive_start_date ?? "").slice(0, 10);
  const today = todayIso(undefined, settingsRow?.timezone);
  const bounds = new Map<string, { minIso: string; maxIso: string }>();
  const hiddenByOrg = new Map<string, boolean>();
  type OrgTotal = {
    name: string;
    total: number;
    filled: number;
    hidden: boolean;
    dateActive: string;
    dateInactive: string;
  };
  const totals = new Map<string, OrgTotal>();
  for (const org of (orgsRes.data ?? []) as {
    id: string;
    name: string;
    date_active: string | null;
    date_inactive: string | null;
    hidden: boolean | null;
  }[]) {
    const dateActive = String(org.date_active ?? "").slice(0, 10);
    const dateInactive = String(org.date_inactive ?? "").slice(0, 10);
    orgNames.set(org.id, org.name);
    hiddenByOrg.set(org.id, Boolean(org.hidden));
    totals.set(org.id, {
      name: org.name,
      total: 0,
      filled: 0,
      hidden: Boolean(org.hidden),
      dateActive,
      dateInactive,
    });
    if (!dateActive) {
      bounds.set(org.id, { minIso: today, maxIso: "" });
      continue;
    }
    const { minIso, maxIso } = loggingWindow(
      archiveStart,
      dateActive,
      dateInactive,
      today,
    );
    bounds.set(org.id, { minIso, maxIso });
  }
  const dayRows = (
    (daysRes.data ?? []) as {
      id: string;
      organization_id: string;
      work_date: string;
      attendance: string | null;
      notes: string | null;
      rating: number | null;
      comments: string | null;
    }[]
  ).filter((row) => {
    const iso = row.work_date.slice(0, 10);
    const bound = bounds.get(row.organization_id);
    if (!bound) return false;
    return iso >= bound.minIso && iso <= bound.maxIso;
  });
  const dayIds = dayRows.map((row) => row.id);
  const workCount = new Map<string, number>();
  const citationCount = new Map<string, number>();
  if (dayIds.length) {
    const [workRes, citationRes] = await Promise.all([
      client.from("work").select("day_id").in("day_id", dayIds),
      client.from("citations").select("day_id").in("day_id", dayIds),
    ]);
    if (workRes.error) throw workRes.error;
    if (citationRes.error) throw citationRes.error;
    for (const row of (workRes.data ?? []) as { day_id: string }[]) {
      workCount.set(row.day_id, (workCount.get(row.day_id) ?? 0) + 1);
    }
    for (const row of (citationRes.data ?? []) as { day_id: string }[]) {
      citationCount.set(row.day_id, (citationCount.get(row.day_id) ?? 0) + 1);
    }
  }

  type OverviewDay = {
    orgId: string;
    orgName: string;
    iso: string;
    href: string;
    sections: string[];
    hiddenNote?: string;
  };
  const filled: OverviewDay[] = [];
  const empty: OverviewDay[] = [];
  for (const row of dayRows) {
    const iso = row.work_date.slice(0, 10);
    const org = totals.get(row.organization_id) ?? {
      name: orgNames.get(row.organization_id) ?? row.organization_id,
      total: 0,
      filled: 0,
      hidden: hiddenByOrg.get(row.organization_id) ?? false,
      dateActive: "",
      dateInactive: "",
    };
    org.total += 1;
    const href = `/?org=${encodeURIComponent(row.organization_id)}&iso=${encodeURIComponent(iso)}`;
    const sections = filledSections({
      notes: row.notes ?? "",
      comments: row.comments ?? "",
      attendance: parseAttendance(row.attendance),
      rating: row.rating,
      workCount: workCount.get(row.id) ?? 0,
      citationCount: citationCount.get(row.id) ?? 0,
    });
    const day = {
      orgId: row.organization_id,
      orgName: org.name,
      iso,
      href,
      sections,
      hiddenNote: org.hidden ? HIDDEN_ORG_NOTE : undefined,
    };
    if (sections.length) {
      org.filled += 1;
      filled.push(day);
    } else {
      empty.push(day);
    }
    totals.set(row.organization_id, org);
  }
  const byNewest = (a: OverviewDay, b: OverviewDay) =>
    b.iso.localeCompare(a.iso) || a.orgName.localeCompare(b.orgName);
  filled.sort(byNewest);
  empty.sort(byNewest);

  const hiddenOrgCount = [...totals.values()].filter((org) => org.hidden).length;
  const orgLines = [...totals.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((org) => {
      const hidden = org.hidden ? " (hidden organization)" : "";
      const dateActive = org.dateActive || "none";
      const dateInactive = org.dateInactive || "none";
      return `- ${org.name}${hidden}: Date Active ${dateActive}, Date Inactive ${dateInactive}. In this archive view: ${org.filled} filled-in / ${org.total} total days (${org.total - org.filled} empty logs)`;
    });
  const wholeFilled = filled.length;
  const wholeTotal = filled.length + empty.length;
  const listedFilled = filled.slice(0, DAY_LIST_CAP);
  const extraFilled = filled.length - listedFilled.length;
  const filledLines = listedFilled.map((day) => {
    const title = formatDayTitle(day.iso);
    const hidden = day.hiddenNote ? `; HIDDEN: ${day.hiddenNote}` : "";
    return `- [${day.orgName} · ${title}](${day.href}) — ${day.sections.join(", ")}${hidden}`;
  });
  if (extraFilled > 0) {
    filledLines.push(`- …and ${extraFilled} more filled-in days`);
  }
  const listedEmpty = empty.slice(0, DAY_LIST_CAP);
  const extraEmpty = empty.length - listedEmpty.length;
  const emptyLines = listedEmpty.map((day) => {
    const title = formatDayTitle(day.iso);
    const hidden = day.hiddenNote ? ` — HIDDEN: ${day.hiddenNote}` : "";
    return `- [${day.orgName} · ${title}](${day.href})${hidden}`;
  });
  if (extraEmpty > 0) {
    emptyLines.push(`- …and ${extraEmpty} more empty logs`);
  }

  const text = [
    `Whole archive: ${wholeFilled} filled-in entries / ${wholeTotal} total day rows. Empty logs are not content, but each still has an organization and a date.`,
    orgLines.length
      ? `Organizations: ${totals.size} total, ${hiddenOrgCount} hidden. This list is every organization and does not depend on which days are in the archive view.\n${orgLines.join("\n")}`
      : "No organizations.",
    filledLines.length
      ? `Filled-in days (newest first):\n${filledLines.join("\n")}`
      : "No days have notes, comments, work, citations, attendance, or a rating.",
    emptyLines.length
      ? `Empty logs (newest first). Use these organization and date links when asked about empty logs:\n${emptyLines.join("\n")}`
      : "No empty logs.",
  ].join("\n\n");

  return {
    text,
    orgNames,
    days: [...filled, ...empty].map((day) => ({
      orgId: day.orgId,
      orgName: day.orgName,
      iso: day.iso,
      href: day.href,
      title: formatDayTitle(day.iso),
      hiddenNote: day.hiddenNote,
    })),
  };
}

export async function backfillEntryEmbeddings(client: SupabaseClient) {
  if (!flags.chivebot) return;
  const [orgsRes, daysRes] = await Promise.all([
    client.from("organizations").select("id, name"),
    client
      .from("days")
      .select("id, organization_id, work_date, attendance, notes, rating, comments"),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  if (daysRes.error) throw daysRes.error;
  const orgs = new Map(
    ((orgsRes.data ?? []) as { id: string; name: string }[]).map((org) => [
      org.id,
      org.name,
    ]),
  );
  const dayRows = (daysRes.data ?? []) as {
    id: string;
    organization_id: string;
    work_date: string;
    attendance: DayEntry["attendance"];
    notes: string | null;
    rating: number | null;
    comments: string | null;
  }[];
  const dayIds = dayRows.map((row) => row.id);
  let workRows: {
    id: string;
    day_id: string;
    title: string | null;
    description: string | null;
    link: string | null;
  }[] = [];
  let citationRows: {
    id: string;
    day_id: string;
    title: string | null;
    url: string | null;
    attachment: string | null;
  }[] = [];
  if (dayIds.length) {
    const [workRes, citationRes] = await Promise.all([
      client
        .from("work")
        .select("id, day_id, title, description, link")
        .in("day_id", dayIds),
      client
        .from("citations")
        .select("id, day_id, title, url, attachment")
        .in("day_id", dayIds),
    ]);
    if (workRes.error) throw workRes.error;
    if (citationRes.error) throw citationRes.error;
    workRows = (workRes.data ?? []) as typeof workRows;
    citationRows = (citationRes.data ?? []) as typeof citationRows;
  }
  const workByDay = new Map<string, DayEntry["work"]>();
  for (const row of workRows) {
    const list = workByDay.get(row.day_id) ?? [];
    list.push({
      id: row.id,
      title: row.title ?? "",
      description: row.description ?? "",
      link: row.link ?? "",
    });
    workByDay.set(row.day_id, list);
  }
  const artifactsByDay = new Map<string, DayEntry["artifacts"]>();
  for (const row of citationRows) {
    const list = artifactsByDay.get(row.day_id) ?? [];
    list.push({
      id: row.id,
      title: row.title ?? "",
      url: row.url ?? "",
      attachment: row.attachment ?? "",
      attachmentKey: "",
    });
    artifactsByDay.set(row.day_id, list);
  }

  const desired: DesiredEmbedding[] = [];
  for (const row of dayRows) {
    const iso = row.work_date.slice(0, 10);
    desired.push(
      ...fieldsFromDay({
        orgId: row.organization_id,
        orgName: orgs.get(row.organization_id) ?? row.organization_id,
        iso,
        dayId: row.id,
        day: {
          attendance: parseAttendance(row.attendance),
          notes: row.notes ?? "",
          rating: row.rating,
          comments: row.comments ?? "",
          work: workByDay.get(row.id) ?? [],
          artifacts: artifactsByDay.get(row.id) ?? [],
        },
      }),
    );
  }
  const existing = await loadExisting(client, dayIds);
  await upsertEmbeddings(client, desired, existing);
}

export async function embedQuery(question: string) {
  return embedText(question, "RETRIEVAL_QUERY");
}

export async function matchChivebotEntries(
  client: SupabaseClient,
  embedding: number[],
  matchCount = CHIVEBOT_MATCH_COUNT,
) {
  const [{ data, error }, settingsRes, orgsRes] = await Promise.all([
    client.rpc("match_chivebot_entries", {
      query_embedding: toVectorLiteral(embedding),
      match_count: matchCount,
    }),
    client
      .from("settings")
      .select("archive_start_date, timezone")
      .eq("id", 1)
      .maybeSingle(),
    client.from("organizations").select("id, date_active, date_inactive"),
  ]);
  if (error) throw error;
  if (settingsRes.error) throw settingsRes.error;
  if (orgsRes.error) throw orgsRes.error;
  const settingsRow = settingsRes.data as {
    archive_start_date?: string | null;
    timezone?: string | null;
  } | null;
  const archiveStart = String(settingsRow?.archive_start_date ?? "").slice(0, 10);
  const today = todayIso(undefined, settingsRow?.timezone);
  const bounds = new Map<string, { minIso: string; maxIso: string }>();
  for (const org of (orgsRes.data ?? []) as {
    id: string;
    date_active: string | null;
    date_inactive: string | null;
  }[]) {
    const dateActive = String(org.date_active ?? "").slice(0, 10);
    bounds.set(
      org.id,
      dateActive
        ? loggingWindow(
            archiveStart,
            dateActive,
            String(org.date_inactive ?? "").slice(0, 10),
            today,
          )
        : { minIso: today, maxIso: "" },
    );
  }
  // The match function already limits to this window. Repeat it here so a
  // day outside the window cannot be quoted.
  return ((data ?? []) as ChivebotMatch[]).filter((row) => {
    const iso = String(row.work_date).slice(0, 10);
    const bound = bounds.get(row.organization_id);
    if (!bound) return false;
    return iso >= bound.minIso && iso <= bound.maxIso;
  });
}

export function buildGeneratePrompt(
  question: string,
  matches: ChivebotMatch[],
  orgNames: Map<string, string>,
  overview: string,
  dayLinks: ArchiveDayLink[] = [],
) {
  const hiddenByKey = new Map(
    dayLinks
      .filter((day) => day.hiddenNote)
      .map((day) => [`${day.orgId}:${day.iso}`, day.hiddenNote]),
  );
  const excerpts = matches.length
    ? matches
        .map((match, index) => {
          const iso = String(match.work_date).slice(0, 10);
          const orgName =
            orgNames.get(match.organization_id) ?? match.organization_id;
          const href = `/?org=${encodeURIComponent(match.organization_id)}&iso=${encodeURIComponent(iso)}`;
          const hidden = hiddenByKey.get(`${match.organization_id}:${iso}`);
          const mark = hidden ? `; HIDDEN: ${hidden}` : "";
          return `[${index + 1}] [${orgName} · ${formatDayTitle(iso)}](${href})${mark}; section: ${match.section}\n${match.content}`;
        })
        .join("\n\n")
    : "No field excerpts were close to this question.";
  return `Archive excerpts:

The Organizations section lists every organization, including hidden ones and ones with no days in this view. Use it for questions about organizations: how many, which are hidden, names, Date Active, and Date Inactive. Day lists and the "in this archive view" day counts only include days inside Archive Start and each organization's Date Active / Date Inactive. Empty logs are not filled-in entries, but they do have an organization and a date — use those listed links when asked about them. Do not cite days that are not in this overview.
${overview}

Field excerpts (use these for quotes, work items, notes, comments, ratings, attendance):
${excerpts}

Use the overview and field excerpts together. When an organization is relevant — which workplace a day belongs to, comparing organizations, or listing entries — name it. If it is marked as a hidden organization, say so. Day links must use the excerpt form [Organization · weekday / year month day](/?org=ID&iso=YYYY-MM-DD), copied completely; never emit a partial URL. A count or yes/no that does not point at a day does not need a link. You may format with markdown: **bold** section labels, and a bullet list with one complete day link per line. Do not flatten list items into a paragraph.

Question:
${question}`;
}
