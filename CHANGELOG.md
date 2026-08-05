# Changelog

## Unreleased — Choose Your Journey

**Added**
- Six plans: 3-Day Initiation, 9-Day Agōgē, 30-Day Forge, 60-Day Discipline, 90-Day Transformation, 300-Day Legacy
  (PREP / MAIN CAMPAIGNS), all selectable, with a "Recommended for you" marker after the readiness questions.
- Progressive onboarding wizard: readiness, weekly availability, fixed sport days, max session length, equipment,
  limitations, recovery style, measurable goal (required), optional event date, plan preview (next 7 days, weekly mix,
  milestones with projected dates, first boss) → **Begin My Journey**.
- Deterministic, personalized schedule generator (phases, deloads, event taper, sport-day recovery, safety limits) in
  TypeScript and SQL with a parity test.
- My Journey: extend (preview + confirm, continues at Day N+1), adjust schedule/sport/event, reschedule from today,
  pause/resume, goals, plan-change history.
- Day 3 readiness review; Day 9/30/60/90/300 checkpoints on the journey map; goals can seed promotion trials.
- `sport` activity type; Quests tab shows the real plan by week; Home shows plan, Day X / N, phase, next checkpoint,
  forecast, adaptations, morning intention and evening reflection.
- Opt-in analytics events (`plan_viewed`, `plan_selected`, `journey_started`, `day_credited`, `journey_extended`,
  `trial_attempted`, `rank_unlocked`) with a pluggable sink; matching server audit events.
- RPCs: `create_journey`, `preview_journey`, `extend_journey`, `update_journey_plan`, `add_player_goal`,
  `set_goal_status`, `record_checkpoint_assessment`.

**Changed**
- `complete_workout` credits against the journey's planned session, at most once per local date and only in
  chronological order; records the eligibility reason.
- `get_command_center` / `export_my_data` include journey data. `set_campaign_paused` re-projects on resume.

**Migrated**
- Existing nine-day campaigns are backfilled with their original content; history, dates and XP untouched.
  `create_campaign_enrollment` remains for older app builds.

**Known gaps**
- Day 90/300 promotions need device-recorded / coach-reviewed evidence (not producible yet).
- No native simulator/device run yet; no AI plan suggestions; no analytics vendor.
