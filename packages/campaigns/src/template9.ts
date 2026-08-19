import type { ActivityType } from "@agogeraining/training";

export interface DayTemplate {
  day: number;
  key: string;
  theme: string;
  focus: "oath" | "strength" | "cardio" | "recovery" | "trial_prep" | "trial";
  title: string;
  description: string;
  primary: { type: string; allowedActivityTypes: ActivityType[]; minDurationSeconds: number };
  alternatives: { noGym: string; indoorOnly: string; limitedTime: string; mobility: string };
  side: Array<{ type: string; label: string; allowedActivityTypes: ActivityType[]; minDurationSeconds: number }>;
}

const sideMobility = { type: "mobility", label: "5-minute mobility flow", allowedActivityTypes: ["mobility" as ActivityType], minDurationSeconds: 300 };
const sideWalk = { type: "cardio", label: "10-minute easy walk", allowedActivityTypes: ["walking" as ActivityType, "hiking" as ActivityType], minDurationSeconds: 600 };

/** Nine-day Agōgē campaign v1. Effort is self-paced; none of these days requires maximal effort. */
export const AGOGE_9: DayTemplate[] = [
  { day: 1, key: "oath", theme: "The Oath", focus: "oath", title: "Take the Oath",
    description: "Finish your baseline and do 10+ minutes of easy movement of your choice. Start where you are.",
    primary: { type: "cardio", allowedActivityTypes: ["walking", "hiking", "running", "cycling", "swimming", "mobility", "custom"], minDurationSeconds: 600 },
    alternatives: { noGym: "Walk around the block.", indoorOnly: "March in place or follow a mobility video.", limitedTime: "10 minutes is the whole quest.", mobility: "Gentle seated or standing mobility counts." },
    side: [sideMobility] },
  { day: 2, key: "strength-1", theme: "Strength I", focus: "strength", title: "Full-body technique",
    description: "2–3 rounds of squat, push, pull and hinge patterns with easy loads. Focus on form, stop well short of failure.",
    primary: { type: "strength", allowedActivityTypes: ["strength", "obstacle"], minDurationSeconds: 900 },
    alternatives: { noGym: "Bodyweight squats, incline push-ups, band or table rows.", indoorOnly: "Same session at home.", limitedTime: "One round of each pattern, 15 minutes.", mobility: "Use box squats and wall push-ups; skip any painful movement." },
    side: [sideMobility] },
  { day: 3, key: "endurance-1", theme: "Endurance I", focus: "cardio", title: "Easy aerobic session",
    description: "20–40 minutes at a conversational pace (Zone 2): walk, jog, bike or swim.",
    primary: { type: "cardio", allowedActivityTypes: ["walking", "hiking", "running", "cycling", "swimming"], minDurationSeconds: 1200 },
    alternatives: { noGym: "Brisk walk outdoors.", indoorOnly: "Stationary bike, treadmill walk or stairs.", limitedTime: "20 minutes counts.", mobility: "Seated cycling, swimming or water walking if joints need less impact." },
    side: [sideMobility] },
  { day: 4, key: "recovery-1", theme: "Recovery", focus: "recovery", title: "Planned recovery",
    description: "Rest is training. Light mobility or an easy stroll, or simply mark the day as planned rest.",
    primary: { type: "recovery", allowedActivityTypes: ["recovery", "mobility", "walking"], minDurationSeconds: 0 },
    alternatives: { noGym: "Nothing needed.", indoorOnly: "Nothing needed.", limitedTime: "Marking rest is enough.", mobility: "Breathing and gentle range-of-motion work." },
    side: [] },
  { day: 5, key: "strength-2", theme: "Strength II", focus: "strength", title: "Controlled strength progress",
    description: "Repeat Strength I and add a small amount of load or a rep or two where it felt easy.",
    primary: { type: "strength", allowedActivityTypes: ["strength", "obstacle"], minDurationSeconds: 1200 },
    alternatives: { noGym: "Slow tempo bodyweight work (3 seconds down).", indoorOnly: "Same session at home.", limitedTime: "Two rounds, 15 minutes minimum.", mobility: "Keep ranges comfortable; use supported variations." },
    side: [sideWalk] },
  { day: 6, key: "endurance-2", theme: "Endurance II", focus: "cardio", title: "Sustainable cardio",
    description: "30–50 minutes of easy cardio, a bit longer than Day 3. A hike counts.",
    primary: { type: "cardio", allowedActivityTypes: ["walking", "hiking", "running", "cycling", "swimming"], minDurationSeconds: 1500 },
    alternatives: { noGym: "Long walk or hike.", indoorOnly: "Treadmill or bike.", limitedTime: "25 minutes minimum counts.", mobility: "Low-impact options: bike, pool, elliptical." },
    side: [sideMobility] },
  { day: 7, key: "recovery-wisdom", theme: "Recovery & Wisdom", focus: "recovery", title: "Rest and reflect",
    description: "Planned recovery with an optional Stoic reflection. Ask what was within your control this week.",
    primary: { type: "recovery", allowedActivityTypes: ["recovery", "mobility", "walking"], minDurationSeconds: 0 },
    alternatives: { noGym: "Nothing needed.", indoorOnly: "Nothing needed.", limitedTime: "Marking rest is enough.", mobility: "Gentle stretching." },
    side: [{ type: "reflection", label: "Evening reflection", allowedActivityTypes: ["custom"], minDurationSeconds: 0 }] },
  { day: 8, key: "trial-prep", theme: "Trial Preparation", focus: "trial_prep", title: "Comfortable rehearsal",
    description: "Rehearse the skill you chose for tomorrow's trial at about 70% effort. Confirm your evidence method.",
    primary: { type: "skill", allowedActivityTypes: ["strength", "running", "walking", "hiking", "cycling", "swimming", "obstacle", "custom"], minDurationSeconds: 600 },
    alternatives: { noGym: "Rehearse with what you own.", indoorOnly: "Rehearse indoors.", limitedTime: "10 minutes is enough.", mobility: "Rehearse a modified version of the skill." },
    side: [sideMobility] },
  { day: 9, key: "first-trial", theme: "First Trial", focus: "trial", title: "Your first trial",
    description: "Attempt your chosen assessment and compare it with your baseline. Pass by improving your own mark, with good form and no all-out risk. You can reschedule if you're not feeling right.",
    primary: { type: "skill", allowedActivityTypes: ["strength", "running", "walking", "hiking", "cycling", "swimming", "obstacle", "custom"], minDurationSeconds: 300 },
    alternatives: { noGym: "Choose a skill you can test at home.", indoorOnly: "Choose an indoor test.", limitedTime: "Short tests (max push-ups, timed walk) work.", mobility: "Choose a mobility range or a supported-strength test." },
    side: [] },
];
