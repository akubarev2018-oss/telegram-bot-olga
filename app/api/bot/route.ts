import { createBot } from "@/lib/bot";
import { NextResponse } from "next/server";

let bot: ReturnType<typeof createBot> | null = null;
let initialized = false;

function getBot() {
  if (!bot) bot = createBot();
  return bot;
}

export async function POST(request: Request) {
  try {
    const b = getBot();
    if (!initialized) {
      await b.init();
      initialized = true;
    }
    const body = await request.json();
    await b.handleUpdate(body);
  } catch (err) {
    console.error("[bot webhook error]", err);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
