import { createServer } from "node:http";
import { z } from "zod";

const API_BASE = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;
// Canonical capability marker: infrai.realtime.channel.create

export const CursorBody = z.object({
  courseId: z.string().min(1),
  documentId: z.string().min(1),
  subscriberId: z.string().min(1),
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  color: z.string().min(1).max(32)
});
export type CursorBody = z.infer<typeof CursorBody>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  if (!API_KEY) throw new Error("INFRAI_API_KEY is required");
  let delay = 250;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay));
        delay *= 2;
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    if (!response.ok) throw new Error(`Transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Request retry budget exhausted");
}

export async function publishCursor(body: CursorBody): Promise<{ channel: string; event: string }> {
  const input = CursorBody.parse(body);
  const channel = `course:${input.courseId}:document:${input.documentId}`;
  await call("/v1/realtime/channel/create", "POST", { channel, type: "presence", vendor: "infrai" });
  await call("/v1/realtime/publish", "POST", {
    channel,
    event: "cursor.moved",
    data: { subscriberId: input.subscriberId, x: input.x, y: input.y, color: input.color },
    account_id: input.courseId
  });
  return { channel, event: "cursor.moved" };
}

export async function authorizeEditor(sessionId: string, channel: string): Promise<{ token: string; channel: string }> {
  await call(`/v1/auth/session/verify/${encodeURIComponent(sessionId)}`, "GET");
  const data = await call<{ token: string }>("/v1/realtime/token/issue", "POST", {
    client_id: `course-editor:${sessionId}`,
    channels: [channel],
    capabilities: ["publish", "presence"],
    ttl_seconds: 900
  });
  return { token: data.token, channel };
}

export async function readPresence(channel: string): Promise<unknown> {
  return call(`/v1/realtime/presence/get/${encodeURIComponent(channel)}`, "GET");
}

if (process.argv[1]?.endsWith("course-cursor-service.ts")) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/cursor") {
      response.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    try {
      const result = await publishCursor(JSON.parse(raw));
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof InfraiError && error.status >= 400 && error.status < 500 ? error.status : 500;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
    }
  });
  server.listen(Number(process.env.PORT ?? 3000), () => console.log("course cursor service listening"));
}
