"use server";

import { cookies } from "next/headers";
import {
  backfillEntryEmbeddings,
  buildGeneratePrompt,
  CHIVEBOT_SYSTEM_PROMPT,
  clearChivebotSessions,
  embedQuery,
  loadArchiveOverview,
  matchChivebotEntries,
  toVectorLiteral,
} from "@/lib/chivebot";
import {
  citationTargets,
  linkArchiveDays,
  normalizeChatMarkdown,
  type ArchiveDayLink,
} from "@/lib/chivebotChat";
import { flags } from "@/lib/flags";
import { generateText, geminiKind, isGeminiConfigured } from "@/lib/gemini";
import { requireSession } from "@/lib/session";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase";

const CHIVEBOT_COOKIE = "chivebot_session";
const HISTORY_LIMIT = 12;

export type ChivebotChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type ChivebotLoadResult = {
  available: boolean;
  messages: ChivebotChatMessage[];
};

export type ChivebotSendResult =
  | { ok: true; message: ChivebotChatMessage }
  | { ok: false; error: "quota" | "connect" | "error" };

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function cookieOptions(maxAge = 60 * 60 * 24 * 365) {
  const secure =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.SITE_URL?.startsWith("https://"));
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}

function dropSessionCookie(jar: Awaited<ReturnType<typeof cookies>>) {
  jar.set(CHIVEBOT_COOKIE, "", cookieOptions(0));
  jar.delete(CHIVEBOT_COOKIE);
}

async function gated() {
  await requireSession();
  if (!flags.chivebot) return { available: false as const, client: null };
  if (!isGeminiConfigured() || !isSupabaseConfigured()) {
    return { available: false as const, client: null };
  }
  const client = createAdminClient();
  if (!client) return { available: false as const, client: null };
  const probe = await client.from("chivebot_session").select("id").limit(1);
  if (probe.error) return { available: false as const, client: null };
  return { available: true as const, client };
}

async function loadMessages(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  sessionId: string,
) {
  const { data, error } = await client
    .from("chivebot_message")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
  }));
}

export async function loadChivebotChat(): Promise<ChivebotLoadResult> {
  try {
    const { available, client } = await gated();
    if (!available || !client) return { available: false, messages: [] };
    const jar = await cookies();
    const sessionId = jar.get(CHIVEBOT_COOKIE)?.value;
    if (!sessionId) return { available: true, messages: [] };
    const existing = await client
      .from("chivebot_session")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (existing.error) return { available: false, messages: [] };
    if (!existing.data?.id) {
      dropSessionCookie(jar);
      return { available: true, messages: [] };
    }
    return { available: true, messages: await loadMessages(client, sessionId) };
  } catch {
    return { available: false, messages: [] };
  }
}

async function ensureSession(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
) {
  const jar = await cookies();
  const current = jar.get(CHIVEBOT_COOKIE)?.value;
  if (current) {
    const existing = await client
      .from("chivebot_session")
      .select("id")
      .eq("id", current)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
  }
  const inserted = await client
    .from("chivebot_session")
    .insert({})
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw inserted.error ?? new Error("Could not start a ChiveBot session.");
  }
  jar.set(CHIVEBOT_COOKIE, inserted.data.id as string, cookieOptions());
  return inserted.data.id as string;
}

export async function sendChivebotMessage(
  question: string,
): Promise<ChivebotSendResult> {
  const text = question.trim();
  if (!text) return { ok: false, error: "error" };
  try {
    const { available, client } = await gated();
    if (!available || !client) return { ok: false, error: "connect" };
    const sessionId = await ensureSession(client);
    const userInsert = await client
      .from("chivebot_message")
      .insert({ session_id: sessionId, role: "user", content: text })
      .select("id")
      .single();
    if (userInsert.error || !userInsert.data?.id) {
      return { ok: false, error: "connect" };
    }
    const userId = userInsert.data.id as string;

    let embedding: number[];
    try {
      embedding = await embedQuery(text);
    } catch (error) {
      return { ok: false, error: geminiKind(error) };
    }

    const queryInsert = await client.from("chivebot_query_embedding").insert({
      session_id: sessionId,
      message_id: userId,
      embedding: toVectorLiteral(embedding),
    });
    if (queryInsert.error) return { ok: false, error: "connect" };

    try {
      await backfillEntryEmbeddings(client);
    } catch {
      /* retrieve whatever is already indexed */
    }

    let matches: Awaited<ReturnType<typeof matchChivebotEntries>> = [];
    let overview = "";
    let dayLinks: ArchiveDayLink[] = [];
    const orgNames = new Map<string, string>();
    try {
      const [matched, archive] = await Promise.all([
        matchChivebotEntries(client, embedding),
        loadArchiveOverview(client),
      ]);
      matches = matched;
      overview = archive.text;
      dayLinks = archive.days;
      for (const [id, name] of archive.orgNames) orgNames.set(id, name);
    } catch {
      return { ok: false, error: "connect" };
    }

    const historyRows = await client
      .from("chivebot_message")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (historyRows.error) return { ok: false, error: "connect" };
    const history = ((historyRows.data ?? []) as MessageRow[])
      .filter((row) => row.id !== userId)
      .slice(-HISTORY_LIMIT)
      .map((row) => ({ role: row.role, content: row.content }));

    let reply: string;
    try {
      reply = await generateText({
        system: CHIVEBOT_SYSTEM_PROMPT,
        history,
        prompt: buildGeneratePrompt(text, matches, orgNames, overview, dayLinks),
      });
    } catch (error) {
      return { ok: false, error: geminiKind(error) };
    }

    reply = normalizeChatMarkdown(linkArchiveDays(reply, dayLinks));
    const citations = citationTargets(reply);
    const assistantInsert = await client
      .from("chivebot_message")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: reply,
        citations: citations.length ? citations : null,
      })
      .select("id, content")
      .single();
    if (assistantInsert.error || !assistantInsert.data) {
      return { ok: false, error: "connect" };
    }
    await client
      .from("chivebot_session")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return {
      ok: true,
      message: {
        id: assistantInsert.data.id as string,
        role: "assistant",
        content: assistantInsert.data.content as string,
      },
    };
  } catch (error) {
    return { ok: false, error: geminiKind(error) };
  }
}

export async function clearChivebotChat(): Promise<ChivebotLoadResult> {
  try {
    const { available, client } = await gated();
    if (!available || !client) return { available: false, messages: [] };
    const jar = await cookies();
    await clearChivebotSessions(client);
    dropSessionCookie(jar);
    return { available: true, messages: [] };
  } catch {
    return { available: false, messages: [] };
  }
}
