/** Original Stoic-inspired prompts (no third-party text). Virtues: wisdom, courage, justice, temperance. */
export const STOIC_PROMPTS: Array<{ key: string; virtue: "wisdom" | "courage" | "justice" | "temperance" | "control"; text: string }> = [
  { key: "control", virtue: "control", text: "What is within my control today, and what is not?" },
  { key: "courage", virtue: "courage", text: "Did I show courage while acting with sound judgment?" },
  { key: "temperance", virtue: "temperance", text: "What would temperance look like in my training and recovery?" },
  { key: "justice", virtue: "justice", text: "How did I treat others fairly today?" },
  { key: "improve", virtue: "wisdom", text: "What is one small thing I can improve tomorrow?" },
  { key: "effort", virtue: "control", text: "Where did I put effort into things I can actually influence?" },
  { key: "rest", virtue: "temperance", text: "What did I do today to let my body and mind recover?" },
];
export function promptForDate(localDate: string) {
  const n = Number(localDate.replace(/-/g, ""));
  return STOIC_PROMPTS[n % STOIC_PROMPTS.length]!;
}
