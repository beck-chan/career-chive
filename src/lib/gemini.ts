const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_MODEL = "gemini-embedding-001";
const GENERATE_MODEL = "gemini-flash-lite-latest";
export const EMBEDDING_DIMENSIONS = 768;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "quota" | "connect" | "error",
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function geminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

export function isGeminiConfigured() {
  return Boolean(geminiApiKey());
}

export function isGeminiError(error: unknown): error is GeminiError {
  return error instanceof GeminiError;
}

export function geminiKind(
  error: unknown,
): GeminiError["kind"] {
  return isGeminiError(error) ? error.kind : "error";
}

function errorText(error: unknown) {
  if (isGeminiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function classifyGeminiFailure(status: number, message: string): GeminiError["kind"] {
  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)
  ) {
    return "quota";
  }
  if (
    status === 401 ||
    status === 403 ||
    /API key|PERMISSION_DENIED|UNAUTHENTICATED|not available/i.test(message)
  ) {
    return "connect";
  }
  if (status >= 500 || status === 0) return "connect";
  return "error";
}

async function geminiPost(path: string, body: unknown) {
  const key = geminiApiKey();
  if (!key) {
    throw new GeminiError("GEMINI_API_KEY is not configured.", "connect");
  }
  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/${path}?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    throw new GeminiError(errorText(error) || "Gemini could not connect.", "connect");
  }
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    embedding?: { values?: number[] };
    embeddings?: { values?: number[] }[];
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
  };
  if (!response.ok) {
    const message = json.error?.message || response.statusText || "Gemini request failed.";
    throw new GeminiError(message, classifyGeminiFailure(response.status, message));
  }
  return json;
}

function readEmbedding(values: number[] | undefined) {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new GeminiError("Gemini embedding was the wrong size.", "error");
  }
  return values;
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
) {
  const json = await geminiPost(`models/${EMBED_MODEL}:embedContent`, {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
  return readEmbedding(json.embedding?.values);
}

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
) {
  if (texts.length === 0) return [] as number[][];
  if (texts.length === 1) return [await embedText(texts[0], taskType)];
  const json = await geminiPost(`models/${EMBED_MODEL}:batchEmbedContents`, {
    requests: texts.map((text) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  });
  const embeddings = json.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new GeminiError("Gemini returned the wrong number of embeddings.", "error");
  }
  return embeddings.map((item) => readEmbedding(item.values));
}

export async function generateText(input: {
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  prompt: string;
}) {
  const contents = [
    ...input.history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    { role: "user", parts: [{ text: input.prompt }] },
  ];
  const json = await geminiPost(`models/${GENERATE_MODEL}:generateContent`, {
    systemInstruction: { parts: [{ text: input.system }] },
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiError("Gemini returned an empty reply.", "error");
  }
  return text;
}
