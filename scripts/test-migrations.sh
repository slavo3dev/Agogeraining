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

echo "== apply migrations"
psqlq -f "$ROOT/supabase/tests/00_bootstrap.sql" >/dev/null || exit 1
for f in "$ROOT"/supabase/migrations/*.sql; do
  psqlq -f "$f" >/dev/null 2>"$TMP/err" || { echo "FAILED: $f"; cat "$TMP/err"; exit 1; }
done
ok "all migrations applied"

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

echo "== data export and account deletion"
EX=$(as $A "select public.export_my_data();")
eq "export contains the user's workouts" "true" "$(echo "$EX" | python3 -c 'import json,sys;print(str(len(json.load(sys.stdin)["workouts"])>=9).lower())')"
su "delete from auth.users where id='$A'" 2>"$TMP/del" && ok "deleting the auth user cascades (incl. append-only ledgers)" || bad "account deletion cascade" "$(cat "$TMP/del")"
eq "no ledger rows remain for deleted user" "0" "$(su "select count(*) from public.xp_ledger where user_id='$A'")"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
