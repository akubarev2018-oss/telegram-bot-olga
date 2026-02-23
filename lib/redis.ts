import { kv } from "@vercel/kv";
import type { SessionData } from "./types";

const SESSION_PREFIX = "bd2:session:";

function sessionKey(chatId: number): string {
  return `${SESSION_PREFIX}${chatId}`;
}

export async function getSession(chatId: number): Promise<SessionData | null> {
  const raw = await kv.get<SessionData>(sessionKey(chatId));
  return raw ?? null;
}

export async function setSession(
  chatId: number,
  data: SessionData
): Promise<void> {
  await kv.set(sessionKey(chatId), data);
}

export async function resetSession(chatId: number): Promise<void> {
  await kv.del(sessionKey(chatId));
}
