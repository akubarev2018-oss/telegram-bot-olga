import OpenAI from "openai";
import { OPENAI as PROMPTS } from "@/constants/texts";

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

const USER_PROMPT_TEMPLATE = PROMPTS.userPromptTemplate;

function buildUserPrompt(answers: number[]): string {
  return USER_PROMPT_TEMPLATE.replace(/\{(\d+)\}/g, (_, i) =>
    String(answers[Number(i)] ?? 0)
  );
}

export async function getAnalysis(answers: number[]): Promise<string> {
  const openai = getOpenAI();
  const userPrompt = buildUserPrompt(answers);
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: PROMPTS.systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1500,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return content;
}
