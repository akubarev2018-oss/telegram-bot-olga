import { Bot, Context, InlineKeyboard } from "grammy";
import { getSession, setSession, resetSession } from "./redis";
import type { SessionData } from "./types";
import { DEFAULT_SESSION, TOTAL_QUESTIONS } from "./types";
import { TEXTS, QUESTIONS } from "@/constants/texts";
import { getAnalysis } from "./openai";

export type BotContext = Context & { session: SessionData };

function getChatId(ctx: BotContext): number | undefined {
  return ctx.chat?.id ?? ctx.from?.id;
}

function getUsername(ctx: BotContext): string {
  const u = ctx.from?.username;
  return u ? `@${u}` : (ctx.from?.first_name ?? "Пользователь");
}

/** Session middleware: load from KV, run handlers, then persist. */
async function sessionMiddleware(ctx: BotContext, next: () => Promise<void>) {
  const chatId = getChatId(ctx);
  if (chatId === undefined) return next();
  const stored = await getSession(chatId);
  ctx.session = stored
    ? { ...DEFAULT_SESSION, ...stored }
    : { ...DEFAULT_SESSION };
  if (ctx.from) {
    ctx.session.userInfo = {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    };
  }
  await next();
  await setSession(chatId, ctx.session);
}

function notifyAdmin(text: string) {
  const adminId = process.env.ADMIN_ID;
  if (!adminId) return;
  const bot = getBotInstance();
  bot.api.sendMessage(adminId, text).catch(() => {});
}

let botInstance: Bot<BotContext> | null = null;

export function getBotInstance(): Bot<BotContext> {
  if (!botInstance) throw new Error("Bot not initialized");
  return botInstance;
}

export function createBot(): Bot<BotContext> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Bot<BotContext>(token);
  botInstance = bot;

  bot.use(sessionMiddleware);

  // ——— /start ———
  bot.command("start", async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId) await resetSession(chatId);
    ctx.session = { ...DEFAULT_SESSION };

    const keyboard = new InlineKeyboard().text(
      TEXTS.startButton,
      "start_test"
    );
    await ctx.reply(TEXTS.start, { reply_markup: keyboard });
  });

  // ——— Callback: start_test ———
  bot.callbackQuery("start_test", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "survey";
    ctx.session.currentQuestionIndex = 0;
    ctx.session.answers = [];
    await ctx.reply(QUESTIONS[0], { parse_mode: undefined });
  });

  // ——— Messages during survey (numeric 1–10) ———
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "survey") return next();

    const text = ctx.message.text?.trim() ?? "";
    const num = parseInt(text, 10);
    if (Number.isNaN(num) || num < 1 || num > 10) {
      await ctx.reply(TEXTS.invalidScore);
      return;
    }

    const idx = ctx.session.currentQuestionIndex;
    ctx.session.answers.push(num);
    ctx.session.currentQuestionIndex = idx + 1;

    if (ctx.session.currentQuestionIndex < TOTAL_QUESTIONS) {
      const nextQ = QUESTIONS[ctx.session.currentQuestionIndex];
      await ctx.reply(nextQ, { parse_mode: undefined });
      return;
    }

    // ——— 10th answer: run analysis ———
    const answers = ctx.session.answers;
    const username = getUsername(ctx);
    notifyAdmin(
      TEXTS.adminTestDone
        .replace("{username}", username.replace("@", ""))
        .replace("{answers}", answers.join(", "))
    );

    let analysisText: string;
    try {
      analysisText = await getAnalysis(answers);
    } catch (err) {
      console.error("OpenAI error:", err);
      analysisText = TEXTS.analysisError;
    }
    await ctx.reply(analysisText, { parse_mode: "HTML" });

    ctx.session.step = "awaiting_consultation_decision";
    const conversionKb = new InlineKeyboard()
      .text(TEXTS.consultYes, "consult_yes")
      .text(TEXTS.consultNo, "consult_no");
    await ctx.reply(TEXTS.afterAnalysis, { reply_markup: conversionKb });
  });

  // ——— Callback: consult_yes ———
  bot.callbackQuery("consult_yes", async (ctx) => {
    await ctx.answerCallbackQuery();
    const username = getUsername(ctx);
    notifyAdmin(TEXTS.adminConsultRequest.replace("{username}", username.replace("@", "")));

    ctx.session.step = "awaiting_scheduling";

    // Keep funnel clean: no "about me" and no cases, only scheduling button.
    const scheduleKb = new InlineKeyboard().text(
      TEXTS.scheduleButton,
      "schedule_input"
    );
    await ctx.reply(TEXTS.scheduleCta, { reply_markup: scheduleKb });
  });

  // ——— Callback: schedule_input (prompt to type) ———
  bot.callbackQuery("schedule_input", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Напишите в чат 3 варианта дня и времени для консультации.");
  });

  // ——— Callback: consult_no ———
  bot.callbackQuery("consult_no", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "idle";
    ctx.session.currentQuestionIndex = 0;
    ctx.session.answers = [];
    await ctx.reply(TEXTS.consultNoBiography);
    const casesKb = new InlineKeyboard().url(
      TEXTS.consultNoCasesButton,
      TEXTS.consultNoCasesUrl
    );
    await ctx.reply("👇", { reply_markup: casesKb });
    const socialKb = new InlineKeyboard()
      .url(TEXTS.consultNoSocialVkButton, TEXTS.consultNoVkUrl)
      .row()
      .url(TEXTS.consultNoSocialTgButton, TEXTS.consultNoTgSocialUrl)
      .row()
      .url(TEXTS.consultNoSocialMaxButton, TEXTS.consultNoMaxUrl);
    await ctx.reply(TEXTS.consultNoSocialsIntro, { reply_markup: socialKb });
  });

  // ——— Text in awaiting_scheduling: forward to admin, confirm, reset ———
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "awaiting_scheduling") return next();

    const username = getUsername(ctx);
    const message = ctx.message.text ?? "";
    notifyAdmin(
      TEXTS.adminSchedule
        .replace("{username}", username.replace("@", ""))
        .replace("{message}", message)
    );
    await ctx.reply(TEXTS.scheduleConfirm);
    ctx.session.step = "idle";
    ctx.session.currentQuestionIndex = 0;
    ctx.session.answers = [];
  });

  return bot;
}
