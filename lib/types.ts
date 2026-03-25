/**
 * Session state stored in Redis (Vercel KV) per chat_id.
 */
export type SessionStep =
  | "idle"
  | "survey"
  | "awaiting_consultation_decision"
  | "awaiting_scheduling";

export interface SessionData {
  step: SessionStep;
  currentQuestionIndex: number; // 0..7
  answers: number[]; // scores 1-10
  userInfo?: {
    username?: string;
    firstName?: string;
  };
}

export const DEFAULT_SESSION: SessionData = {
  step: "idle",
  currentQuestionIndex: 0,
  answers: [],
};

export const TOTAL_QUESTIONS = 8;
