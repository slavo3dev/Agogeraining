#!/usr/bin/env bash
# Applies all migrations to a throwaway local Postgres and runs integration tests (game flow, RLS, idempotency, concurrency).
# Requires Postgres binaries (initdb, pg_ctl, psql) on PATH. Does not need Docker or the Supabase CLI.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl)")}"
TMP="$(mktemp -d)"; PORT="${PGTEST_PORT:-54399}"
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres
PASS=0; FAIL=0
cleanup() { "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null || exit 1
"$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" -w start >/dev/null || { cat "$TMP/pg.log"; exit 1; }

psqlq() { psql -v ON_ERROR_STOP=1 -qtA "$@"; }
su()  { psqlq -c "$1"; }                       # superuser SQL
# run SQL as an authenticated user (RLS applies). usage: as UID "sql"
as()  { psqlq <<SQL
begin; set local role authenticated; set local "request.jwt.claims" = '{"sub":"$1"}';
$2
commit;
SQL
}
as_admin() { psqlq <<SQL
begin; set local role authenticated; set local "request.jwt.claims" = '{"sub":"$1","app_metadata":{"role":"admin"}}';
$2
commit;
SQL
}
as_anon() { psqlq <<SQL
begin; set local role anon;
$1
commit;
SQL
}
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; echo "      $2"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected [$2] got [$3]"; }
fails(){ # label, pattern, command output (stderr merged)
  if [[ "$3" == *"$2"* ]]; then ok "$1"; else bad "$1" "expected error containing [$2], got: $3"; fi; }
uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
clock() { su "insert into public.app_config(key,value) values ('demo_clock', to_jsonb('$1'::text)) on conflict (key) do update set value = excluded.value"; }

apply() { psqlq -f "$1" >/dev/null 2>"$TMP/err" || { echo "FAILED: $1"; cat "$TMP/err"; exit 1; }; }
JOURNEY_EPOCH=20261109   # migrations from this date on introduce Choose Your Journey

echo "== apply pre-journey migrations"
psqlq -f "$ROOT/supabase/tests/00_bootstrap.sql" >/dev/null || exit 1
for f in "$ROOT"/supabase/migrations/*.sql; do [ "$(basename "$f" | cut -c1-8)" -lt $JOURNEY_EPOCH ] && apply "$f"; done
ok "pre-journey migrations applied"

echo "== legacy player mid-way through the original nine-day campaign"
L=$(uuid); su "insert into auth.users(id,email) values ('$L','legacy@test')"
as $L "select public.create_player_profile('Legacy','a1','UTC','metric',null,'hybrid');" >/dev/null
as $L "select public.create_campaign_enrollment('agoge-9','{\"pushUps\":5}','{\"preferredDays\":[0,2,4],\"equipment\":\"none\",\"difficulty\":\"gentle\"}');" >/dev/null
lday() { clock "$1T12:00:00Z"; as $L "select public.complete_workout('$(uuid)','$2','$1T11:00:00Z',$3,null,null,null,'$1','UTC');" >/dev/null; }
lday 2026-10-05 walking 700; lday 2026-10-06 strength 1200; lday 2026-10-07 running 1500
L_XP=$(su "select lifetime_xp from public.profiles where user_id='$L'")
L_LEDGER=$(su "select count(*) from public.xp_ledger where user_id='$L'")

echo "== apply journey migrations (with backfill)"
for f in "$ROOT"/supabase/migrations/*.sql; do [ "$(basename "$f" | cut -c1-8)" -ge $JOURNEY_EPOCH ] && apply "$f"; done
ok "all migrations applied"
eq "legacy: XP untouched by the migration" "$L_XP" "$(su "select lifetime_xp from public.profiles where user_id='$L'")"
eq "legacy: no ledger rows added by the migration" "$L_LEDGER" "$(su "select count(*) from public.xp_ledger where user_id='$L'")"
eq "legacy: 9 planned sessions backfilled" "9" "$(su "select count(*) from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$L'")"
eq "legacy: credited days keep their dates" "2026-10-05,2026-10-06,2026-10-07" "$(su "select string_agg(scheduled_for::text, ',' order by program_day) from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$L' and program_day <= 3")"
eq "legacy: original day-4 content preserved (planned recovery)" "recovery" "$(su "select session_type from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$L' and program_day = 4")"
eq "legacy: credited records labelled and linked" "3" "$(su "select count(*) from public.campaign_day_records r join public.user_campaigns c on c.id=r.campaign_id where c.user_id='$L' and eligibility_reason='legacy' and planned_session_id is not null")"
eq "legacy: migration recorded in plan history" "migrated" "$(su "select string_agg(kind, ',') from public.journey_plan_changes x where user_id='$L'")"
eq "legacy: plan inputs derived from old preferences" "[0, 2, 4]|new" "$(su "select (plan_inputs->'availableWeekdays')::text || '|' || (plan_inputs->>'experience') from public.user_campaigns where user_id='$L'")"
lday 2026-10-08 recovery 0
eq "legacy: continues at Day 4 with planned recovery credited once" "4|240" "$(su "select qualified_days || '|' || (select lifetime_xp from public.profiles where user_id='$L') from public.user_campaigns where user_id='$L'")"
eq "legacy: cached XP still equals the ledger" "$(su "select sum(xp_delta) from public.xp_ledger where user_id='$L'")" "$(su "select lifetime_xp from public.profiles where user_id='$L'")"

echo "== programming parity (TypeScript generator vs SQL internal.generate_sessions)"
(cd "$ROOT" && node_modules/.bin/tsx scripts/programming-parity.ts) > "$TMP/parity.json" || { bad "parity fixtures" "tsx failed"; }
python3 - "$TMP/parity.json" > "$TMP/parity.sql" <<'PY'
import json, sys
for f in json.load(open(sys.argv[1])):
    inputs = json.dumps(f["inputs"]).replace("'", "''")
    print(f"select internal.generate_sessions({f['horizon']}, '{inputs}'::jsonb, '{f['anchor']}'::date, {f['fromDay']})::text;")
PY
psqlq -f "$TMP/parity.sql" > "$TMP/parity.out" 2>&1 || { cat "$TMP/parity.out"; bad "parity SQL" "generate_sessions failed"; }
PARITY=$(python3 - "$TMP/parity.json" "$TMP/parity.out" <<'PY'
import json, sys
ts = json.load(open(sys.argv[1])); sql = [json.loads(l) for l in open(sys.argv[2]) if l.strip()]
for i, (f, s) in enumerate(zip(ts, sql)):
    a, b = f["sessions"], s
    if json.dumps(a, sort_keys=True) != json.dumps(b, sort_keys=True):
        for x, y in zip(a, b):
            if json.dumps(x, sort_keys=True) != json.dumps(y, sort_keys=True):
                print(f"fixture {i} day {x['programDay']}: TS {json.dumps(x, sort_keys=True)[:400]} != SQL {json.dumps(y, sort_keys=True)[:400]}"); break
        else: print(f"fixture {i}: length {len(a)} != {len(b)}")
        sys.exit(0)
print(f"ok {len(ts)} {sum(len(f['sessions']) for f in ts)}")
PY
)
eq "generator parity on all fixtures" "ok" "${PARITY%% *}"
[ "${PARITY%% *}" = "ok" ] || echo "      $PARITY"

echo "== level curve parity (TypeScript engine vs SQL)"
TS_LEVELS=$(cd "$ROOT" && node_modules/.bin/tsx -e 'import {xpToReachLevel} from "./packages/game-engine/src/index"; console.log(Array.from({length:100},(_,i)=>xpToReachLevel(i+1)).join(","))')
SQL_LEVELS=$(su "select string_agg(internal.xp_to_reach_level(l, internal.current_rules())::text, ',' order by l) from generate_series(1,100) l")
eq "xp_to_reach_level matches for levels 1..100" "$TS_LEVELS" "$SQL_LEVELS"
TS_RULES=$(cd "$ROOT" && node_modules/.bin/tsx -e 'import {RULES_V1} from "./packages/game-engine/src/index"; console.log(JSON.stringify(RULES_V1))')
SQL_RULES=$(su "select internal.current_rules()::text")
eq "rules JSON in DB equals RULES_V1" "$(echo "$TS_RULES" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin),sort_keys=True))')" "$(echo "$SQL_RULES" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin),sort_keys=True))')"

A=$(uuid); B=$(uuid)
su "insert into auth.users(id,email) values ('$A','a@test'),('$B','b@test')"

echo "== onboarding"
as $A "select public.create_player_profile('Leonidas','a1','UTC','metric','30-39','hybrid',array['strength']);" >/dev/null && ok "A: profile created"
as $A "select public.create_campaign_enrollment('agoge-9','{\"pushUps\":8}','{}');" >/dev/null && ok "A: enrolled"
as $B "select public.create_player_profile('Gorgo','a2','UTC','metric',null,'strength');" >/dev/null
as $B "select public.create_campaign_enrollment('agoge-9','{}','{}');" >/dev/null
fails "profile is required before play" "profile_required" "$(as "$(uuid)" "select public.create_campaign_enrollment('agoge-9','{}','{}');" 2>&1)"

echo "== nine qualifying days"
KEYS=()
day() { # n date activity seconds
  local k=$(uuid); KEYS[$1]=$k
  clock "$2T12:00:00Z"
  as $A "select public.complete_workout('$k','$3','$2T11:00:00Z',$4,null,null,null,'$2','UTC');" >/dev/null
}
day 1 2026-11-02 walking 700
day 2 2026-11-03 strength 1200
# side quest: mobility session after the strength day
clock 2026-11-03T18:00:00Z
as $A "select public.complete_workout('$(uuid)','mobility','2026-11-03T17:00:00Z',320,null,null,null,'2026-11-03','UTC');" >/dev/null
eq "side quest awards +15 (60+60+15 = 135)" "135" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
day 3 2026-11-04 running 1500
day 4 2026-11-05 recovery 0
day 5 2026-11-06 strength 1300     # 5th qualified day in the ISO week -> weekly consistency +100
eq "weekly consistency milestone awarded once" "1" "$(su "select count(*) from public.xp_ledger where user_id='$A' and source_type='weekly_consistency'")"
day 6 2026-11-07 walking 1600
day 7 2026-11-08 recovery 0
day 8 2026-11-09 strength 700
day 9 2026-11-10 strength 400
eq "9 qualified days recorded" "9" "$(su "select qualified_days from public.user_campaigns where user_id='$A'")"
eq "campaign completed" "completed" "$(su "select state from public.user_campaigns where user_id='$A'")"
eq "XP = 9*60 + 15 + 100" "655" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
eq "cached XP equals ledger sum" "$(su "select sum(xp_delta) from public.xp_ledger where user_id='$A'")" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"

echo "== replay / idempotency"
R=$(as $A "select public.complete_workout('${KEYS[9]}','strength','2026-11-10T11:00:00Z',400,null,null,null,'2026-11-10','UTC');")
eq "replaying a completed workout flags duplicate" "true" "$(echo "$R" | python3 -c 'import json,sys;print(str(json.load(sys.stdin)["duplicate"]).lower())')"
eq "replay awards nothing" "655" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
as $A "select public.complete_workout('$(uuid)','strength','2026-11-10T11:30:00Z',900,null,null,null,'2026-11-10','UTC');" >/dev/null
eq "second workout same day (no new quest) adds no XP" "655" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"

echo "== day-boundary and input guards"
clock 2026-11-10T12:00:00Z
fails "cannot log days far in the future" "local_day_out_of_range" "$(as $A "select public.complete_workout('$(uuid)','walking','2026-11-10T11:00:00Z',600,null,null,null,'2026-11-15','UTC');" 2>&1)"
fails "cannot backfill beyond yesterday" "local_day_out_of_range" "$(as $A "select public.complete_workout('$(uuid)','walking','2026-11-04T11:00:00Z',600,null,null,null,'2026-11-04','UTC');" 2>&1)"
fails "started_at in the future rejected" "started_in_future" "$(as $A "select public.complete_workout('$(uuid)','walking','2026-11-11T11:00:00Z',600,null,null,null,'2026-11-10','UTC');" 2>&1)"
fails "invalid timezone rejected" "invalid_timezone" "$(as $A "select public.complete_workout('$(uuid)','walking','2026-11-10T11:00:00Z',600,null,null,null,'2026-11-10','Mars/Olympus');" 2>&1)"

echo "== promotion gating"
fails "cannot claim rank without a passed trial (days+XP are not enough)" "promotion_not_eligible: [\"trial\"]" "$(as $A "select public.claim_promotion('hoplites','$(uuid)');" 2>&1)"
fails "cannot skip ranks" "not_next_rank" "$(as $A "select public.claim_promotion('enomotarches','$(uuid)');" 2>&1)"
CH=$(as $A "select public.create_personal_challenge('Max push-ups','pushups','higher_better',8,12,'reps','2026-11-12','meet_target','Stop if form breaks','hoplites');")
fails "implausible target rejected" "target_implausible" "$(as $A "select public.create_personal_challenge('Huge','pushups','higher_better',8,100,'reps','2026-11-12','meet_target',null,'hoplites');" 2>&1)"
AK=$(uuid)
R=$(as $A "select public.submit_challenge_attempt('$CH',9,'reps','$AK');")
eq "below target => failed, no XP" "failed" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["outcome"])')"
eq "failed trial removes nothing" "655" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
fails "cannot retry without retry step" "challenge_not_active" "$(as $A "select public.submit_challenge_attempt('$CH',13,'reps','$(uuid)');" 2>&1)"
as $A "select public.retry_challenge('$CH');" >/dev/null && ok "retry path from failed"
fails "unit mismatch rejected" "unit_mismatch" "$(as $A "select public.submit_challenge_attempt('$CH',13,'kg','$(uuid)');" 2>&1)"
AK2=$(uuid)
R=$(as $A "select public.submit_challenge_attempt('$CH',13,'reps','$AK2');")
eq "meeting target => passed" "passed" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["outcome"])')"
as $A "select public.submit_challenge_attempt('$CH',13,'reps','$AK2');" >/dev/null
eq "attempt replay doesn't double the +150" "805" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
eq "evidence honestly labelled self_reported" "self_reported" "$(su "select evidence_type from public.challenge_attempts where id=(select resolved_attempt_id from public.user_challenges where id='$CH')")"

echo "== concurrent promotion claims (two simultaneous sessions)"
K=$(uuid)
( as $A "select public.claim_promotion('hoplites','$K');" >"$TMP/c1" 2>&1 ) &
( as $A "select public.claim_promotion('hoplites','$K');" >"$TMP/c2" 2>&1 ) &
wait
eq "exactly one rank_history row" "1" "$(su "select count(*) from public.user_rank_history where user_id='$A' and rank_key='hoplites'")"
eq "promotion XP awarded exactly once (805+500)" "1305" "$(su "select lifetime_xp from public.profiles where user_id='$A'")"
eq "profile rank is Hoplitēs" "hoplites" "$(su "select rank_key from public.profiles where user_id='$A'")"
eq "exactly one of two concurrent calls was a duplicate" "1" "$(cat "$TMP/c1" "$TMP/c2" | grep -c '"duplicate": true')"
eq "first-rank cosmetics granted" "2" "$(su "select count(*) from public.user_inventory where user_id='$A'")"
eq "level reflects XP" "$(su "select internal.level_for_xp(1305, internal.current_rules())")" "$(su "select level from public.profiles where user_id='$A'")"

echo "== user B (no qualifying days) cannot be promoted"
CHB=$(as $B "select public.create_personal_challenge('Push-ups','pushups','higher_better',5,8,'reps','2026-11-12','meet_target',null,'hoplites');")
as $B "select public.submit_challenge_attempt('$CHB',9,'reps','$(uuid)');" >/dev/null
fails "passed trial alone is insufficient (days + XP missing)" "qualified_days" "$(as $B "select public.claim_promotion('hoplites','$(uuid)');" 2>&1)"
eq "B has no rank history" "0" "$(su "select count(*) from public.user_rank_history where user_id='$B'")"

echo "== plausibility review path"
CHR=$(as $B "select public.create_personal_challenge('Plank','plank','higher_better',60,90,'s','2026-11-12','meet_target',null,null);")
R=$(as $B "select public.submit_challenge_attempt('$CHR',900,'s','$(uuid)');")
eq "absurd result is held for review, not passed" "needs_review" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["outcome"])')"
ATT=$(su "select id from public.challenge_attempts where challenge_id='$CHR'")
fails "a normal user cannot verify" "forbidden" "$(as $B "select public.verify_challenge_attempt('$ATT','accept','x');" 2>&1)"
as_admin "$(uuid)" "select public.verify_challenge_attempt('$ATT','accept','Reviewed video');" >/dev/null && ok "admin verification works"
eq "admin review upgrades evidence level" "admin_reviewed" "$(su "select evidence_type from public.challenge_attempts where id='$ATT'")"
eq "admin action audited" "1" "$(su "select count(*) from public.audit_events where event_type='attempt_accepted_by_admin'")"

echo "== reflection, measurements, units"
as $A "select public.record_stoic_reflection('2026-11-10','control','Focus on effort.');" >/dev/null
as $A "select public.record_stoic_reflection('2026-11-10','control','Edited text.');" >/dev/null
eq "reflection XP once per day" "1" "$(su "select count(*) from public.xp_ledger where user_id='$A' and source_type='reflection'")"
as $A "select public.record_measurement('weight',200,'lb','home scale','2026-11-10T08:00:00Z');" >/dev/null
eq "200 lb stored as kg" "90.72" "$(su "select value from public.body_measurements where user_id='$A'")"
fails "implausible weight rejected" "implausible_value" "$(as $A "select public.record_measurement('weight',5,'kg',null,'2026-11-10T08:00:00Z');" 2>&1)"

echo "== RLS: B cannot see or touch A's private data"
for t in workout_sessions body_measurements stoic_reflections xp_ledger coin_ledger user_campaigns user_challenges challenge_attempts user_rank_history user_inventory; do
  eq "B sees 0 rows of A in $t" "0" "$(as $B "select count(*) from public.$t where user_id='$A';")"
done
eq "B sees only their own profile" "1" "$(as $B "select count(*) from public.profiles;")"
eq "A sees own measurements" "1" "$(as $A "select count(*) from public.body_measurements;")"
fails "client cannot write XP directly" "permission denied" "$(as $A "update public.profiles set lifetime_xp = 999999 where user_id='$A';" 2>&1)"
fails "client cannot change rank directly" "permission denied" "$(as $A "update public.profiles set rank_key='polemarchos' where user_id='$A';" 2>&1)"
fails "client cannot insert ledger rows" "permission denied" "$(as $A "insert into public.xp_ledger(user_id,source_type,source_id,rule_version,xp_delta,local_day) values ('$A','promotion_boss','$(uuid)',1,500,current_date);" 2>&1)"
fails "client cannot insert rank history" "permission denied" "$(as $A "insert into public.user_rank_history(user_id,rank_key,rules_version) values ('$A','polemarchos',1);" 2>&1)"
fails "client cannot flip verification" "permission denied" "$(as $A "update public.challenge_attempts set verification_status='accepted' where user_id='$A';" 2>&1)"
fails "client cannot fake a workout row" "permission denied" "$(as $A "insert into public.workout_sessions(user_id,activity_type,started_at,local_day,timezone,duration_seconds,external_id) values ('$A','strength',now(),current_date,'UTC',100,'x');" 2>&1)"
fails "client cannot read audit events" "permission denied" "$(as $A "select * from public.audit_events;" 2>&1)"
fails "client cannot move the clock (app_config)" "permission denied" "$(as $A "insert into public.app_config(key,value) values ('demo_clock','\"2030-01-01T00:00:00Z\"');" 2>&1)"
fails "internal award function is unreachable" "permission denied" "$(as $A "select internal.award_xp('$A','promotion_boss','$(uuid)',current_date);" 2>&1)"
fails "anon cannot call RPCs" "permission denied" "$(as_anon "select public.complete_workout('$(uuid)','walking',now(),600,null,null,null,current_date,'UTC');" 2>&1)"
fails "anon cannot read reference data" "permission denied" "$(as_anon "select * from public.rank_definitions;" 2>&1)"
fails "unauthenticated authenticated-role (no sub) rejected" "not_authenticated" "$(psqlq -c "set role authenticated; select public.get_command_center(current_date);" 2>&1)"
as $A "update public.profiles set display_name='Leonidas I' where user_id='$A';" >/dev/null && ok "client may edit own display name"
eq "B cannot rename A (0 rows)" "Leonidas I" "$(as $B "update public.profiles set display_name='pwned' where user_id='$A';" >/dev/null; su "select display_name from public.profiles where user_id='$A'")"

echo "== ledgers and invariants"
fails "xp_ledger is append-only (update)" "append-only" "$(su "update public.xp_ledger set xp_delta = 1 where id = (select min(id) from public.xp_ledger)" 2>&1)"
fails "xp_ledger is append-only (delete)" "append-only" "$(su "delete from public.xp_ledger where id = (select min(id) from public.xp_ledger)" 2>&1)"
fails "lifetime XP can never decrease" "cannot decrease" "$(su "update public.profiles set lifetime_xp = 1 where user_id='$A'" 2>&1)"
fails "duplicate ledger key rejected at the DB level" "duplicate key" "$(su "insert into public.xp_ledger(user_id,source_type,source_id,rule_version,xp_delta,local_day) select user_id,source_type,source_id,rule_version,xp_delta,local_day from public.xp_ledger limit 1" 2>&1)"

echo "== command center read model"
CC=$(as $A "select public.get_command_center('2026-11-10');")
eq "command center reports qualifiedDays 9" "9" "$(echo "$CC" | python3 -c 'import json,sys;print(json.load(sys.stdin)["campaign"]["qualifiedDays"])')"
as "$(uuid)" "select 1;" >/dev/null
NEWU=$(uuid); su "insert into auth.users(id,email) values ('$NEWU','c@test')"
as $NEWU "select public.create_player_profile('Newbie','a3','UTC','imperial',null,'general_health');" >/dev/null
eq "command center works for a player with no campaign" "None" "$(as $NEWU "select public.get_command_center('2026-11-10')->'campaign';" | python3 -c 'import sys;print(sys.stdin.read().strip() or "x")' | sed 's/^$/None/' | sed 's/^null$/None/')"

echo "== Choose Your Journey"
GOAL='{"title":"More push-ups","metric":"pushups","direction":"higher_better","baseline":8,"target":12,"unit":"reps","targetDate":"2027-01-30"}'
inputs() { # experience focus availableWeekdays sportDays [eventDate]
  echo "{\"experience\":\"$1\",\"focus\":\"$2\",\"availableWeekdays\":$3,\"sportDays\":$4,\"sportName\":null,\"maxSessionMinutes\":60,\"equipment\":\"home_basic\",\"hasLimitations\":false,\"recoveryStyle\":\"active\",\"eventDate\":${5:-null}}"
}
next_quest() { su "select (ps.spec->'primary'->'allowedActivityTypes'->>0) || ' ' || (ps.spec->'primary'->>'minDurationSeconds') from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$1' and c.state='active' and ps.superseded_at is null and ps.program_day=c.qualified_days+1"; }
play() { # uid date — do exactly what the next planned session asks
  local q; q=$(next_quest "$1"); clock "$2T12:00:00Z"
  as "$1" "select public.complete_workout('$(uuid)','${q%% *}','$2T11:00:00Z',${q##* },null,null,null,'$2','UTC');" >/dev/null
}
days() { su "select qualified_days from public.user_campaigns where user_id='$1' order by created_at desc limit 1"; }
newplayer() { local u; u=$(uuid); su "insert into auth.users(id,email) values ('$u','$u@test')"; as "$u" "select public.create_player_profile('Player','a1','UTC','metric',null,'hybrid');" >/dev/null; echo "$u"; }

C=$(newplayer); clock 2026-12-07T09:00:00Z
fails "plan inputs: 7 training days refused (rest day required)" "keep_at_least_one_rest_day" "$(as $C "select public.create_journey('initiation-3','$(inputs new hybrid '[0,1,2,3,4,5,6]' '[]')'::jsonb,'{}','$GOAL'::jsonb,'UTC');" 2>&1)"
fails "a measurable goal is required" "goal_required" "$(as $C "select public.create_journey('initiation-3','$(inputs new hybrid '[0,2,4]' '[]')'::jsonb,'{}',null,'UTC');" 2>&1)"
fails "unknown plan refused" "unknown_plan" "$(as $C "select public.create_journey('forever-999','$(inputs new hybrid '[0,2,4]' '[]')'::jsonb,'{}','$GOAL'::jsonb,'UTC');" 2>&1)"
as $C "select public.create_journey('initiation-3','$(inputs new hybrid '[0,2,4]' '[]')'::jsonb,'{\"pushUps\":8}','$GOAL'::jsonb,'UTC');" >/dev/null && ok "3-Day Initiation started"
R=$(as $C "select public.create_journey('initiation-3','$(inputs new hybrid '[0,2,4]' '[]')'::jsonb,'{}','$GOAL'::jsonb,'UTC');")
eq "create_journey retry is idempotent (duplicate, one journey)" "true|1" "$(echo "$R" | python3 -c 'import json,sys;print(str(json.load(sys.stdin)["duplicate"]).lower())')|$(su "select count(*) from public.user_campaigns where user_id='$C'")"
eq "goal stored with the journey" "1" "$(su "select count(*) from public.player_goals where user_id='$C' and campaign_id is not null")"
CC=$(as $C "select public.get_command_center('2026-12-07');")
eq "command center shows 3-Day Initiation Day 1/3" "3-Day Initiation|1|3|orientation" "$(echo "$CC" | python3 -c 'import json,sys;c=json.load(sys.stdin)["campaign"];print(f"{c["planName"]}|{c["programDay"]}|{c["totalDays"]}|{c["session"]["sessionType"]}")')"
play $C 2026-12-07; play $C 2026-12-08; play $C 2026-12-09
eq "3 eligible dates complete the Initiation" "3|completed" "$(su "select qualified_days || '|' || state from public.user_campaigns where user_id='$C'")"
eq "3-day completion is NOT a promotion" "agoge_trainee|0" "$(su "select rank_key || '|' || (select count(*) from public.user_rank_history where user_id='$C') from public.profiles where user_id='$C'")"
eq "Day 3 readiness review is offered" "[3]" "$(as $C "select public.get_command_center('2026-12-09')->'campaign'->>'pendingReviews';")"
fails "cannot review an unreached checkpoint" "not_a_checkpoint" "$(as $C "select public.record_checkpoint_assessment(9,'{\"energy\":4,\"soreness\":2,\"scheduleFit\":\"good\",\"confidence\":4}');" 2>&1)"
as $C "select public.record_checkpoint_assessment(3,'{\"energy\":4,\"soreness\":2,\"scheduleFit\":\"good\",\"confidence\":4}');" >/dev/null && ok "readiness review saved"
eq "review clears the pending checkpoint" "[]" "$(as $C "select public.get_command_center('2026-12-09')->'campaign'->>'pendingReviews';")"
C_XP=$(su "select lifetime_xp from public.profiles where user_id='$C'")
fails "extension needs explicit confirmation" "confirmation_required" "$(as $C "select public.extend_journey('agoge-9', false);" 2>&1)"
as $C "select public.extend_journey('agoge-9', true);" >/dev/null && ok "extend 3 → 9 after completion"
eq "extension resumes at Day 4, active, same XP" "3|active|$C_XP|4" "$(su "select qualified_days || '|' || state || '|' || (select lifetime_xp from public.profiles where user_id='$C') from public.user_campaigns where user_id='$C'")|$(as $C "select public.get_command_center('2026-12-10')->'campaign'->>'programDay';")"
eq "Day 4 is projected for tomorrow (today already credited)" "2026-12-10" "$(su "select scheduled_for from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$C' and ps.superseded_at is null and program_day=4")"
eq "plan change history: created, extended" "created,extended" "$(su "select string_agg(kind, ',' order by id) from public.journey_plan_changes where user_id='$C'")"

D=$(newplayer); clock 2026-12-07T09:00:00Z
as $D "select public.create_journey('agoge-9','$(inputs returning hybrid '[0,2,4,5]' '[3]')'::jsonb,'{}','$GOAL'::jsonb,'UTC');" >/dev/null
for i in 0 1 2 3 4 5 6 7 8; do play $D "$(python3 -c "import datetime as d;print(d.date(2026,12,7)+d.timedelta(days=$i))")"; done
eq "9-Day Agōgē completed in 9 eligible dates" "9|completed" "$(su "select qualified_days || '|' || state from public.user_campaigns where user_id='$D'")"
eq "Thursday soccer was the planned Day 4 session" "sport" "$(su "select session_type from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$D' and program_day=4")"
eq "Friday after soccer was planned recovery" "recovery" "$(su "select session_type from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$D' and program_day=5")"
DCH=$(as $D "select public.create_personal_challenge('Max push-ups','pushups','higher_better',10,12,'reps','2026-12-20','improve_on_baseline',null,'hoplites');")
R=$(as $D "select public.submit_challenge_attempt('$DCH',9,'reps','$(uuid)');")
eq "failed trial attempt recorded as failed" "failed" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["outcome"])')"
fails "a failed trial never grants rank" "promotion_not_eligible" "$(as $D "select public.claim_promotion('hoplites','$(uuid)');" 2>&1)"
as $D "select public.retry_challenge('$DCH');" >/dev/null
as $D "select public.submit_challenge_attempt('$DCH',11,'reps','$(uuid)');" >/dev/null
as $D "select public.claim_promotion('hoplites','$(uuid)');" >/dev/null && ok "verified trial pass after Day 9 earns Hoplitēs"
eq "D is Hoplitēs" "hoplites" "$(su "select rank_key from public.profiles where user_id='$D'")"
D_XP=$(su "select lifetime_xp from public.profiles where user_id='$D'"); D_W=$(su "select count(*) from public.workout_sessions where user_id='$D'")
D_HIST=$(su "select md5(string_agg(spec::text, '' order by program_day)) from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$D' and program_day<=9")
clock 2026-12-16T09:00:00Z
as $D "select public.extend_journey('transformation-90', true);" >/dev/null && ok "extend 9 → 90 the next day"
eq "after extension: Day 10 of 90 next; XP, workouts, rank intact" "9|90|$D_XP|$D_W|hoplites|10" "$(su "select c.qualified_days || '|' || t.total_qualifying_days || '|' || p.lifetime_xp || '|' || (select count(*) from public.workout_sessions where user_id=c.user_id) || '|' || p.rank_key from public.user_campaigns c join public.campaign_templates t on t.id=c.template_id join public.profiles p on p.user_id=c.user_id where c.user_id='$D'")|$(as $D "select public.get_command_center('2026-12-16')->'campaign'->>'programDay';")"
eq "credited Days 1–9 sessions are byte-identical after extension" "$D_HIST" "$(su "select md5(string_agg(spec::text, '' order by program_day)) from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$D' and program_day<=9 and superseded_at is null")"
eq "future days 10–90 regenerated for the 90-day horizon" "81|30,60,90" "$(su "select count(*) || '|' || (select string_agg(program_day::text, ',' order by program_day) from public.planned_sessions ps2 where ps2.campaign_id=c.id and ps2.superseded_at is null and ps2.session_type='trial' and program_day>9) from public.planned_sessions ps join public.user_campaigns c on c.id=ps.campaign_id where c.user_id='$D' and ps.superseded_at is null and program_day>9 group by c.id")"
fails "shortening refused" "shortening_not_supported" "$(as $D "select public.extend_journey('forge-30', true);" 2>&1)"
fails "same horizon refused" "same_horizon" "$(as $D "select public.extend_journey('transformation-90', true);" 2>&1)"
play $D 2026-12-16
eq "next credit is Day 10" "10" "$(days $D)"
Q=$(next_quest $D); as $D "select public.complete_workout('$(uuid)','${Q%% *}','2026-12-16T11:30:00Z',${Q##* },null,null,null,'2026-12-16','UTC');" >/dev/null
eq "a second matching workout the same date adds no day" "10" "$(days $D)"
clock 2026-12-17T12:00:00Z
as $D "select public.complete_workout('$(uuid)','${Q%% *}','2026-12-16T11:30:00Z',${Q##* },null,null,null,'2026-12-16','UTC');" >/dev/null
eq "a late retry for an already-credited date adds nothing" "10" "$(days $D)"
clock 2026-12-17T20:00:00Z
Q=$(next_quest $D)
as $D "select public.complete_workout('$(uuid)','${Q%% *}','2026-12-17T19:00:00Z',${Q##* },null,null,null,'2026-12-18','Asia/Tokyo');" >/dev/null
eq "Tokyo date credits Day 11" "11" "$(days $D)"
Q=$(next_quest $D)
as $D "select public.complete_workout('$(uuid)','${Q%% *}','2026-12-17T19:30:00Z',${Q##* },null,null,null,'2026-12-17','America/New_York');" >/dev/null
eq "flying back to NY (earlier local date) can't double-credit" "11" "$(days $D)"

echo "== plan adjustment, pause/resume, history protection"
E=$(newplayer); clock 2027-01-04T09:00:00Z   # a Monday
as $E "select public.create_journey('transformation-90','$(inputs regular hybrid '[0,1,2,4,5]' '[3]')'::jsonb,'{}','$GOAL'::jsonb,'UTC');" >/dev/null
eq "90-Day: 90 sessions with checkpoints at 3/9/30/60/90" "90|3,9,30,60,90" "$(su "select count(*) || '|' || string_agg(program_day::text, ',' order by program_day) filter (where spec->'checkpoint' <> 'null'::jsonb) from public.planned_sessions where user_id='$E' and superseded_at is null")"
eq "90-Day starts at Day 1/90" "1/90" "$(as $E "select (public.get_command_center('2027-01-04')->'campaign'->>'programDay') || '/' || (public.get_command_center('2027-01-04')->'campaign'->>'totalDays');")"
for i in $(seq 0 11); do play $E "$(python3 -c "import datetime as d;print(d.date(2027,1,4)+d.timedelta(days=$i))")"; done
eq "12 days credited" "12" "$(days $E)"
E_HIST=$(su "select md5(string_agg(spec::text, '' order by program_day)) from public.planned_sessions where user_id='$E' and program_day<=12 and superseded_at is null")
E_W=$(su "select md5(string_agg(id::text || duration_seconds, '' order by id)) from public.workout_sessions where user_id='$E'")
as $E "select public.update_journey_plan('$(inputs regular hybrid '[0,2,3,4,5]' '[1]')'::jsonb,'Soccer moved to Tuesday');" >/dev/null && ok "soccer moved Thursday → Tuesday"
eq "completed sessions and workouts unchanged" "$E_HIST|$E_W" "$(su "select md5(string_agg(spec::text, '' order by program_day)) from public.planned_sessions where user_id='$E' and program_day<=12 and superseded_at is null")|$(su "select md5(string_agg(id::text || duration_seconds, '' order by id)) from public.workout_sessions where user_id='$E'")"
eq "future sport days are all Tuesdays" "2" "$(su "select string_agg(distinct extract(isodow from scheduled_for)::text, ',') from public.planned_sessions where user_id='$E' and superseded_at is null and program_day>12 and session_type='sport'")"
eq "previous future rows superseded, not deleted" "78" "$(su "select count(*) from public.planned_sessions where user_id='$E' and superseded_at is not null")"
eq "plan change recorded with reason" "plan_adjusted|Soccer moved to Tuesday|13|1|2" "$(su "select kind || '|' || reason || '|' || effective_program_day || '|' || from_generation || '|' || to_generation from public.journey_plan_changes where user_id='$E' order by id desc limit 1")"
fails "credited history cannot be superseded" "cannot_rewrite_credited_history" "$(su "update public.planned_sessions set superseded_at = now() where user_id='$E' and program_day=1" 2>&1)"
fails "planned sessions cannot be edited in place" "immutable" "$(su "update public.planned_sessions set planned_minutes = 1 where user_id='$E' and program_day=20 and superseded_at is null" 2>&1)"
fails "invalid adjustment refused" "too_many_sport_days" "$(as $E "select public.update_journey_plan('$(inputs regular hybrid '[0]' '[1,2,3,4,5]')'::jsonb,null);" 2>&1)"
clock 2027-01-16T09:00:00Z
as $E "select public.set_campaign_paused(true);" >/dev/null
Q=$(next_quest $E); [ -z "$Q" ] && Q=$(su "select (spec->'primary'->'allowedActivityTypes'->>0) || ' ' || (spec->'primary'->>'minDurationSeconds') from public.planned_sessions where user_id='$E' and superseded_at is null and program_day=13")
as $E "select public.complete_workout('$(uuid)','${Q%% *}','2027-01-16T08:00:00Z',${Q##* },null,null,null,'2027-01-16','UTC');" >/dev/null
eq "paused journey earns no day" "12" "$(days $E)"
clock 2027-01-25T09:00:00Z
as $E "select public.set_campaign_paused(false);" >/dev/null
eq "resume re-projects Day 13 to today; nothing lost" "12|2027-01-25" "$(days $E)|$(su "select scheduled_for from public.planned_sessions where user_id='$E' and superseded_at is null and program_day=13")"
eq "pause/resume recorded" "paused,resumed" "$(su "select string_agg(kind, ',' order by id) from public.journey_plan_changes where user_id='$E' and kind in ('paused','resumed')")"
as $E "select public.update_journey_plan(null,null);" >/dev/null && ok "reschedule-only regeneration works"

echo "== journey RLS"
for t in planned_sessions journey_plan_changes player_goals journey_assessments; do
  eq "B sees 0 rows of other players in $t" "0" "$(as $B "select count(*) from public.$t where user_id <> '$B';")"
done
eq "E sees own planned sessions" "1" "$(as $E "select (count(*) > 0)::int from public.planned_sessions;")"
fails "client cannot write planned sessions" "permission denied" "$(as $E "insert into public.planned_sessions(campaign_id,user_id,generation_version,program_day,scheduled_for,phase,session_type,intensity,planned_minutes,spec) select campaign_id,user_id,99,1,current_date,'base','recovery','rest',0,'{}' from public.planned_sessions limit 1;" 2>&1)"
fails "client cannot rewrite plan history" "permission denied" "$(as $E "delete from public.journey_plan_changes;" 2>&1)"
fails "client cannot credit days directly" "permission denied" "$(as $E "update public.user_campaigns set qualified_days = 90;" 2>&1)"
fails "generator internals unreachable" "permission denied" "$(as $E "select internal.generate_sessions(9,'{}'::jsonb,current_date,1);" 2>&1)"
eq "preview_journey returns a plan without persisting" "30|$(su "select count(*) from public.user_campaigns where user_id='$E'")" "$(as $E "select jsonb_array_length(public.preview_journey('forge-30','$(inputs new hybrid '[0,2,4]' '[]')'::jsonb)->'sessions');")|$(su "select count(*) from public.user_campaigns where user_id='$E'")"

echo "== data export and account deletion"
EX=$(as $A "select public.export_my_data();")
eq "export contains the user's workouts" "true" "$(echo "$EX" | python3 -c 'import json,sys;print(str(len(json.load(sys.stdin)["workouts"])>=9).lower())')"
su "delete from auth.users where id='$A'" 2>"$TMP/del" && ok "deleting the auth user cascades (incl. append-only ledgers)" || bad "account deletion cascade" "$(cat "$TMP/del")"
eq "no ledger rows remain for deleted user" "0" "$(su "select count(*) from public.xp_ledger where user_id='$A'")"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
