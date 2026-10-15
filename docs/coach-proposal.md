# Atlas Coach: rules proposal

**Status:** approved as proposed (2026-10-14); built in stage 4 (`src/coach/`). See "Build notes" at the end for where the build clarified or departed from the text.
**Date:** 2026-10-14
**Scope:** the on-device Coach: what it decides, when, how sure it is, how it talks, and the evidence behind each rule.

Once approved, this becomes `src/data/coach/knowledge.json` (rules, thresholds, sources) and `src/data/coach/phrases.json` (wording). The engine reads its numbers from those files, so tuning a threshold never means touching logic.

---

## 1. What the evidence says, and what Atlas does with it

Strength labels: **Strong** = consistent meta-analytic or position-stand support. **Moderate** = some meta-analytic support with caveats. **Limited** = few or small studies. **Practitioner** = coaching consensus or survey, little direct testing. Where evidence is mixed, Atlas takes the conservative option (section 7).

| Topic | What the evidence supports | What Atlas does | Strength | Sources |
|---|---|---|---|---|
| Frequency | Train every major muscle at least 2×/week. With volume matched, frequency barely changes muscle growth, but more frequent practice helps strength. | Programs hit each muscle 2×/week. Strength-goal key lifts get 2–3 exposures. | Strong | [1] [3] [6] |
| Weekly volume | Growth rises with weekly hard sets (≥10 sets/muscle/week), with diminishing returns. The ACSM discussion notes a plateau near 18–20 sets. Strength flattens sooner than size. | Weekly sets per muscle are counted fractionally (direct = 1, synergist = 0.5) and kept inside a target band per goal and experience (section 3). | Strong | [1] [3] [4] [5] |
| Load and rep range | Muscle grows across roughly 30–100% of max when sets are hard enough. Strength responds best to heavy loads (≥80% of max). | Muscle: mostly 6–12 reps on compounds, 10–20 on isolation. Strength: key lifts at 4–6 reps (≥80% estimated max). | Strong | [1] [10] [11] |
| How close to failure | Training to failure isn't required. ACSM proposes stopping 2–3 reps short but says exact targets lack evidence. A meta-regression suggests growth improves somewhat closer to failure, while strength doesn't. | Default: stop 2 reps short on compounds and 1–2 on isolation. Only an isolation lift's final set may go to 0–1 left (intermediate and up, muscle goal). Never to failure on Smith squats, deadlifts or RDLs. | Moderate | [1] [7] [8] [9] |
| Effort ratings | Rating reps left in the tank is a practical way to set load. People tend to underestimate their reps left by about 1, and are a bit more accurate near failure. | One tap after each set: "How many more could you have done?" (0, 1, 2, 3, 4+). New lifters get a one-rep cushion. A missing rating is inferred from reps and marked lower-confidence. | Moderate | [13] [14] [15] |
| Progression | Adding reps and adding load both work. Classic guidance: raise load 2–10% once you can beat the rep target by 1–2. | Double progression (reps climb in a range, then load goes up and reps reset). If the machine's next step is too big, Atlas adds reps first. | Strong (load) / Moderate (reps) | [2] [12] |
| Periodization | Complex periodization doesn't reliably beat simple progressive overload. | No complex schemes. Intermediates get a simple 4–6 week effort ramp (e.g. 3 → 2 → 1 reps left), then a lighter week. That's for fatigue management, not magic. | Strong (no advantage) | [1] |
| Autoregulation | Adjusting load from effort ratings performs about as well as fixed percentages. | Effort ratings drive set-to-set and session-to-session adjustments, which is exactly what makes per-user coaching possible. | Moderate | [14] [16] |
| Exercise variation | Planned variation can help regional growth and strength. Random, frequent changes can hurt. | Swaps only when there's a reason: a plateau, pain, or a taken station. Never shuffled for novelty. | Limited | [17] |
| Rest between sets | Over 60 s gives a small growth edge, with little extra beyond about 90 s. On heavy compounds, longer rest (~3 min) beat 1 min for strength and size. Longer rest preserves reps across sets. | Rest by exercise type: heavy compound 2:30–3:00, other compound 2:00, isolation 1:15, small isolation 1:00. Adds time after all-out or heavy low-rep sets. Learns from your rep drop-off. | Moderate | [18] [19] [20] [21] |
| Deloads | Coaches agree deloads reduce fatigue. Athletes report deloading about every 5.6 weeks for about 6 days, cutting volume and effort. A full week off mid-program blunted strength gains in one trial. | A lighter week (fewer sets, lighter, easy effort), not a week off. Scheduled every 5–8 weeks by experience, or earlier when fatigue signals stack up. | Limited / Practitioner | [22] [23] [24] |
| Breaks and coming back | Strength fades first and size more slowly, with larger losses for longer breaks. Lost ground comes back fast: in one trial, a 10-week break was recovered in about 5 weeks of retraining. | Return plans scale with time off: a lighter first session after 2 weeks, a 2–3 week ramp after 4+ weeks. | Moderate (direction) / Practitioner (exact %) | [25] [26] [27] |
| Training in a calorie deficit | In a deficit, strength gains are largely preserved but lean-mass gains are blunted, especially above about 500 kcal/day. Intensity (load) is the key to maintaining strength and size. | Fat-loss goal: protect load first, keep volume, progress conservatively, and celebrate holding strength. | Moderate | [28] [29] |
| Rate of weight loss | About 0.5–1% of body weight per week is recommended to retain lean mass. A slower rate (0.7%/wk) preserved lean mass better than 1.4%/wk in athletes. | The weight trend is compared with 0.5–1%/week. Faster for 2+ weeks gets a gentle flag. No diet prescriptions. | Moderate | [30] [31] |
| Cardio alongside lifting | Concurrent aerobic training doesn't compromise whole-muscle growth or maximal strength in pooled studies. | Cardio entries count toward recovery load but never trigger "cut your cardio". In fat-loss mode, cardio is welcomed. | Moderate | [32] [33] |
| Sleep and readiness | Acute sleep loss (≤6 h) cuts exercise performance (about −7.6% on average). Self-reported wellness tracks training load more sensitively than objective markers. | An **optional** 3-tap check-in (sleep, energy, soreness). A poor answer offers a lighter day, never forces one. Atlas works fully without it (section 4C). | Moderate | [34] [35] |
| Short on time | Prioritize multi-joint lifts. Supersets and similar methods roughly halve session time at similar volume (better for size than max strength). Keep at least about 4 sets/muscle/week. | "Short on time" keeps the key lifts, pairs non-competing accessories as supersets, and drops the lowest-priority sets first. | Moderate | [36] |
| Minimum to maintain | In younger adults, strength and size can be kept for weeks with as little as 1 session/week and 1 set/exercise, if load stays high. | Busy weeks get a "maintenance" floor instead of guilt: keep the heavy sets, drop accessories. | Moderate | [29] |
| Estimating max | Rep-based max estimates are most accurate at ≤10 reps. | Estimated max = load × (1 + (reps + reps left) ÷ 30). Sets over 12 effective reps count at half weight in trends. | Moderate | [38] [39] |
| Push/pull balance | Recreational lifters often show shoulder strength imbalances, associated with (not proven to cause) impingement. Typical push:pull ratios run well above 1:1. | Keeps weekly pulling sets ≥ pushing sets. Low-priority suggestion only. | Limited | [40] [41] |
| Pain | Training on an injury can make it worse. Persisting symptoms warrant professional advice. | Never "push through". Pain on a lift leads to a swap or reduction, and persistent pain leads to "see a doctor or physio". No diagnosis, no medical claims. | Guidance | [42] |

---

## 2. How the Coach works

### Pure functions, one source of truth
```
evaluateCoach(input, { now, moment }) → CoachOutput
  moment: 'today' | 'in-session' | 'post-session' | 'weekly'
  input:  profile, goal, experience, program, gym + equipment, exercise catalog,
          sessions (sets: load, reps, reps-left, rest taken, timestamps), check-ins,
          pain flags, body measurements, coach log (shown insights, decisions)
CoachOutput:
  recommendations[]  stable id = rule + subject + situation fingerprint
  todayPlan?         the adjusted session (loads, reps, sets, swaps, time cap)
  inSession?         set-level adjustment for the current exercise
  review?            post-session or weekly review blocks
  wins[]             PRs, streaks, trends
```
- **No side effects.** The engine never touches the database or UI. The app stores its output in a single `coach` store, and every screen reads that store. That's how Today, the workout, Coach and Plan can't contradict each other.
- **Structured, then worded.** Each recommendation carries a typed `change` (e.g. `{exercise, load: 135→145, reps: 8–10}`), the `facts` it used (your numbers), a `principle` with sources, and a `confidence`. Wording is a separate step (`renderMessage`). A future AI coaching layer can replace or rewrite that step without touching the engine.
- **Decisions are remembered.** Apply, Not now, Use and Keep are logged with the situation fingerprint. The engine reads that log to avoid repeats and to learn preferences: after 3 "Not now"s on the same kind of advice, that rule's priority drops for you.

### Core measures
1. **Estimated max per set:** load × (1 + (reps + reps left) ÷ 30). For a session, the best working set counts. If a set has no rating, reps left is inferred: target hit means about the target, missed reps means 0, and the set is marked lower-confidence.
2. **Lift trend:** a robust slope of session estimated max over the last 4–6 exposures, plus "best ever" for PRs.
3. **Fatigue signals** over a rolling 14-day window (section 4F).
4. **Weekly sets per muscle:** fractional counts from the exercise catalog (direct 1, synergist 0.5).
5. **Body-weight trend:** a smoothed average of entries, from which weekly % change is computed.
6. **Adherence:** planned vs completed sessions, streaks, session length vs plan.

### Confidence: careful early, decisive later
| Level | Shown as | When | Effect |
|---|---|---|---|
| Low | "Early read" | <3 exposures of the lift, ratings on <50% of sets, or >21 days since last exposure | Max one load step per change. Prefer "hold" over "cut". Never trigger early deloads on this alone. |
| Medium | "Fairly sure" | 3–5 exposures with ratings | Normal steps |
| High | "Confident" | 6+ exposures, ratings on most sets, consistent trend | Full-size adjustments, plateau rules active |

Whole-program calls (deloads, volume changes) need at least 2 weeks of data across 3+ lifts. Every card says how sure the Coach is and on how many sessions that's based.

---

## 3. Personalisation tables

### 3.1 Experience level (asked in onboarding, re-checked by the Coach after 3 months)
| | Beginner (<6 months consistent) | Intermediate (6 mo – 2 yr) | Advanced (2+ yr) |
|---|---|---|---|
| Compound reps | 8–12 | 6–10 | 5–10, rotating per block |
| Isolation reps | 10–15 | 10–15 / 12–20 | 8–20, rotating |
| Target reps left | 2–3 | 3 → 1 ramp across the block | 3 → 0–1 ramp (isolation only near 0) |
| Progression | Add load as soon as every set hits the top. Two steps if every set was 4+ left. | Double progression and an effort ramp | Double progression, rep-range rotation, volume tuned per muscle |
| Sets/muscle/week | 8–12, ramping toward ≥10 | 10–16 | 12–20 |
| Lighter week | Every ~8 weeks or on signals | Every 5–6 weeks or on signals | Every 4–6 weeks or on signals |
| Messages | Fewer, simpler, with more "why" | Standard | Denser numbers |

Beginner volume starts below the ≥10-set line on purpose, to limit soreness and build the habit, then ramps up within 4–6 weeks (practitioner choice within ACSM's range [1] [2]).

### 3.2 Goal
| Goal | What the Coach protects | Reps | Effort | Weekly volume | Coach priorities |
|---|---|---|---|---|---|
| Build muscle | Volume and progression | 6–12 compounds, 10–20 isolation | 1–2 left (isolation final set may be 0–1) | Experience band (above) | Sets per muscle, progression, plateaus |
| Get stronger | Heavy key lifts | Key lifts 4–6 (≥80% est. max), accessories 8–12 | 2–3 left on key lifts | Key lifts 2–3×/wk, moderate accessories | Key-lift estimated max, key lifts first, longer rest |
| Lose fat | Load first, then volume | Same as muscle | 2 left (no grinding) | Hold current. May trim up to ~⅓ if recovery suffers. | Strength retention, weight trend 0.5–1%/wk, recovery |
| General fitness | Showing up | 8–15 | 2–3 left | ~10 sets, every muscle 2×/wk | Streaks, balance, cardio |

Key lifts at the Office: Smith squat, Smith incline/bench press, Smith deadlift/RDL, Precor shoulder press, lat pulldown/pull-up, leg press.

---

## 4. Decision rules

Each rule lists **When / Then / Why**, with sources. All thresholds live in `knowledge.json`.

### A. Load and progression (before each session)
**A1 · Calibration (no starting weights, or a new exercise).**
- *When:* an exercise has no history and no entered weight.
- *Then:* start from a conservative catalog guess for your experience level, rounded down to a real load on that machine. Each set's rating sets the next load: 4+ left → about +20% (2–3 steps), because "4+" could hide many more reps; 3 left → +1 step; 1–2 left → hold; 0 left or missed → −1 step. After two exposures the working weight is set. Calibration aims a rep softer than normal (3 left).
- *Why:* rating-based load setting [14] [15]; underestimation of reps left [13].

**A2 · Double progression.**
- *When:* every working set reaches the top of the range at or above the target reps left.
- *Then:* next time, go up to the next available load (equipment-aware) and aim for the bottom of the range. If you hit the top but rated it harder than target (e.g. 0 left when the target was 2), hold the load once and aim for the same reps more comfortably.
- *Why:* [2] [12].

**A3 · Too easy: progress faster.**
- *When:* every set hits the top with reps left at least 2 above target (e.g. "4+" when the target is 2), or the estimated max jumps ≥5%.
- *Then:* skip a step, choosing the load predicted to land mid-range at the target effort. Capped at +10% per session for beginners and low confidence, per the ACSM 2–10% guidance. If you stopped early (mid-range with 4+ left): "Same weight, push to 12."
- *Why:* [2] [14].

**A4 · Hard session or missed reps.**
- *When:* any working set falls below the bottom of the range, or set 1 was rated 0 left at the bottom of the range. If the whole session ran below expectation (≥40% of lifts), it's treated as a fatigue day instead (A4 doesn't fire; see F).
- *Then (one of):*
  - **Small miss** (only the last set short, total reps within ~10% of target): keep the load and the target, so you consolidate.
  - **Muscle, fat-loss or general goal, clear miss:** lower the load to what your estimated max predicts for the target reps (usually 1–2 steps, ~5–10%) and keep the rep range. Size grows across loads when sets are hard, so quality reps win [10] [11] [1].
  - **Strength goal, key lift, clear miss:** keep the load (it's the heavy stimulus strength needs, ≥80% [1]) and drop the rep target one notch (e.g. 6–8 → 4–6) for two exposures, then rebuild.
  - **Second consecutive miss** on the same lift: lower the load regardless of goal.
- The card always says which option was chosen and why.

**A5 · Big equipment jumps.**
- *When:* the next available load is >10% heavier (e.g. 25 → 30 lb dumbbells on lateral raises).
- *Then:* stretch the rep range up by 3–5 reps before moving up ("Stay at 25 lb until you get 15 clean reps"), then jump and reset reps.
- *Why:* rep progression is a viable alternative to load progression [12]; the load range for growth is wide [11].

**A6 · Beginner simplicity.** Beginners see one number to beat ("Beat 140 × 10"), not ranges and ramps. Same engine, simpler surface.

### B. During a session
**B1 · Much harder than expected.**
- *When:* a set's estimated max is ≥7% below expected, or reps fall below the bottom of the range with 0 left.
- *Then:* offer the load predicted to hit the target at the target effort for the remaining sets: "Next two: 180 lb for 10–12" [Use 180] [Keep 200].
- *Limit:* one prompt per exercise per session.

**B2 · Much easier than expected.**
- *When:* the top of the range is hit with reps left ≥ target + 2 on set 1 or 2.
- *Then:* offer +1 step for the next set (beginners: "+2 reps" instead).
- Only at medium confidence or higher.

**B3 · Rest adapts.**
- *When:* reps drop between sets ≥2 more than expected and the rest taken was shorter than planned.
- *Then:* "Take the full 2:30 before set 3." Across sessions: if you consistently start early on isolation lifts with no rep loss, the default shortens by 15 s (never below 60 s). Heavy compounds never drop below 2:00.
- *Why:* [18] [19] [20] [21].

**B4 · Normal fatigue isn't a problem.** Expected drop-off (about 1 rep per set at the same load) is built in, so it never triggers a prompt.

### C. Readiness (optional, easy to hide)
**C0 · Off switch (your requirement).** The readiness check is optional and hidden in one tap:
- The check-in sheet has **Skip today** and **Stop asking**. "Stop asking" turns it off immediately, with a short note: "Readiness check off. Turn it back on in Settings › Workout."
- Settings › Workout has two toggles: **Readiness check before workouts** and **Add a wearable score (Oura, Whoop, Garmin)**. The wearable one is **off by default**.
- When off, nothing about readiness appears anywhere. The Coach relies on performance and effort signals (F1), which work without any check-in.

**C1 · Lower readiness → lighter-day offer.**
- *When:* (if on) two of sleep / energy / soreness are poor, or the wearable score is in your bottom 20%. The wearable score is compared against your own baseline after 10+ entries; until then it's ignored.
- *Then:* offer "Lighter day: same exercises, one fewer set each, no weight increases today" [Use lighter day] [Train as planned].
- *Why:* sleep loss lowers performance [34]; subjective wellness tracks load [35].

**C2 · Very low → short version.**
- *When:* all three answers are poor.
- *Then:* offer a 30-minute key-lifts-only version or easy cardio. Never "skip", and never forced.

### D. Plateau
**D1 · Detect.**
- *When:* 3+ exposures with no new estimated-max best, no rep or load increase at the same load, outside deload/calibration/return weeks, at medium confidence or higher.

**D2 · Respond (first match wins):**
1. Fatigue signals present → a lighter week first (a plateau is often fatigue) [22] [24].
2. Same rep range for ≥6 exposures → change the rep range for a block (muscle: 8–10 → 12–15; strength: 6–8 → 4–6), with the load reset from estimated max [10] [11].
3. Otherwise → a planned swap to another variation in this gym, with progress carried over (I2) [17].
4. Muscle below its volume band → +1 set. Above the band → −1 set [3] [4] [5].

Beginners first get "slow down the lowering and check form" for one exposure before D2.

### E. Volume and balance (weekly)
- **E1 · Below band:** a muscle's planned fractional sets sit below its band for 2 consecutive weeks → +1–2 sets on an existing exercise, or add one from this gym.
- **E2 · Above band with fatigue or plateau:** −1–2 sets.
- **E3 · Push/pull:** weekly push sets exceed pull sets by ≥25% → suggest adding pulling sets (low priority, limited evidence [40] [41]).
- **E4 · Ramp limit:** no muscle's weekly sets rise more than ~20% week to week (practitioner).

A missed session doesn't trigger E1. Volume rules read the planned week, and adherence is handled by G.

### F. Fatigue and lighter weeks
**F1 · Fatigue signals (14-day window):**
- (a) **Effort creep:** ≥3 lifts feel ≥1 rep harder at the same or lower load and reps.
- (b) **Performance dip:** estimated max ≥4% below its 3-exposure average on ≥40% of lifts trained (min 3).
- (c) **Readiness low** on ≥3 of the last 5 check-ins (only if readiness is on).
- (d) **Check-out:** "rough" or "low energy" on ≥2 of the last 3 sessions.
- (e) **New pain flags** on ≥2 lifts.

**F2 · Early lighter week:** ≥2 signals and ≥3 weeks since the last lighter week → "Take your lighter week now." With 1 signal: hold progression this week and offer lighter days.

**F3 · Scheduled lighter week:** every 5–8 weeks by experience (3.1), matching common practice [23]. If you feel fresh, you can push it back once by up to 2 weeks; the Coach notes that.

**F4 · Lighter-week design:** same exercises and frequency, sets −40% (rounded, min 1–2), load about −10%, stop 3–4 reps short. Not a week off [22] [23] [24].

### G. Schedule, time and breaks
- **G1 · Missed session:** offer "Do it today (shifts the week)" or "Skip it", choosing the default that protects key lifts and keeps every muscle at ≥2 exposures if possible.
- **G2 · Short on time (30/45 min):** keep key lifts at full sets, reduce accessories to ≥2 sets, pair non-competing accessories as supersets with 60–90 s rest, and drop the lowest-priority exercises first. The card shows what was dropped and why, plus a time estimate [36] [29].
- **G3 · Coming back after a break** (days since your last lifting session):

| Time off | First session | Ramp |
|---|---|---|
| 8–13 days | As planned, but no load increases | Normal from session 2 |
| 14–27 days | ~90% load, −1 set, stop 3 short | ~95% next session, then normal |
| 28–55 days | ~80% load, −1–2 sets, stop 3–4 short | +5% per session if rated easy; back to normal in ~2 weeks |
| 56+ days | Recalibration (A1 using old history as the guess, ~70%) | ~3 weeks |

Direction from [25] [26] [27]. The exact percentages are a conservative practitioner choice; the goal is avoiding brutal soreness and tweaks while strength returns quickly.

- **G4 · Consistency:** streaks count weeks with all planned sessions (or ≥2 for general fitness). A missed week gets "Welcome back" framing, never guilt.

### H. Goal modifiers
- **H1 · Muscle:** volume band and progression rules lead. The weekly review leads with sets per muscle.
- **H2 · Strength:** key lifts go first in the session (order matters for strength [1]). Rest ≥2:30 on key lifts. Key lifts stay at ≥80% of estimated max [1] [37]. Accessories progress normally.
- **H3 · Fat loss:**
  - Load is protected. When recovery dips, volume is cut before load [29] [33].
  - Progression is offered but never pushed aggressively.
  - Weight trend >1.0%/week for 2+ weeks → gentle flag: "faster than the 0.5–1% that best protects muscle" [30] [31].
  - Trend flat for 3+ weeks → informational only.
  - Strength holding while weight drops is celebrated as a win [28].
  - An optional once-a-month tip about protein [43] (Atlas doesn't track food).
- **H4 · General fitness:** consistency and balance first. Cardio entries count toward the week. Messages focus on streaks and how sessions feel.
- **H5 · Cardio entries:** logged per machine and counted for adherence and recovery load. Never discouraged [32] [33].

### I. Swaps and equipment
- **I1 · Station taken:** offers alternatives from this gym's equipment for the same movement pattern, ranked by similarity and your history with them.
- **I2 · Carrying progress:** every exercise keeps its own history. A first-time swap starts from a conversion: the slot's estimated max × the catalog's ratio for the new variation × 0.9, rounded down to a real load. It's flagged "starting estimate", and after set 1 it's corrected with B1/B2. Conversion ratios are catalog estimates (practitioner); the 0.9 is the conservative cushion.
- **I3 · Gym switch:** programs are written as movement slots, so switching gyms remaps to the best available variation and applies I2.

### J. Pain and safety (overrides everything)
- **J1 · Pain flagged on a lift** (in-session or at check-out, with where):
  - Next exposure: swap to a variation that loads the area differently, or reduce load ~20% and stop 3+ reps short, pain-free range only.
  - Message: "If it hasn't improved in a week or two, or it's sharp, swelling or getting worse, see a doctor or physio." [42]
- **J2 · Repeated pain** in the same area within 3 weeks: pause progression on all lifts that load that area, and repeat the professional-advice line more prominently.
- **J3 · Language rules:** never "push through", never diagnose, never promise recovery or treatment.

### K. Wins (specific, never generic)
- **PRs:** estimated max, rep PR at a load, and heaviest load for the rep range.
- **Streaks:** weeks with all planned sessions.
- **Trend wins:** e.g. "+11 lb estimated max in 5 weeks". The week's volume target is "hit" when every muscle is in its band.
- **Fat-loss wins:** strength held or up while weight trends down.
- **Comebacks:** back to pre-break numbers.

### L. Reviews
- **L1 · After a session:** 1–2 wins, what changes next time (each with Apply), and one insight from a rotating type.
- **L2 · Weekly** (after the last planned session, or Monday):
  - Sessions done vs planned, and sets per muscle vs band (bar chart).
  - Key-lift trends, recovery status and PRs.
  - "Next week" as a short list of recommendations with Apply all / pick.

---

## 5. Messages: personal, never repetitive
- **Built from your numbers.** Every message is assembled from facts (loads, reps, dates, counts, percentages). A message with no number from your log isn't allowed, except safety lines.
- **Composed, not canned.** Each insight type has multiple interchangeable openers, evidence clauses, action clauses and closers (8–12 each, written in a plain, calm voice). A seeded choice avoids the variants used in your last 5 messages of that type. That gives hundreds of distinct phrasings per insight.
- **Insight memory.** Every shown insight is logged with its key and a fingerprint of the facts behind it. The same key is suppressed for 3 sessions or 7 days unless the facts moved materially; a new number or a new state counts as moved. A re-shown insight acknowledges history ("Still stuck at 120 lb, so this time let's change the range").
- **Rotation.** Each review picks at most one insight per type across progress, programming, recovery, technique and consistency, rotating which type leads.
- **Technique** insights come from data: rep drop-off patterns, a first exposure to an exercise, a plateau or a pain flag. They pull a cue from that exercise's form notes and never repeat the same cue within 4 weeks.
- **Tone:** plain words, no jargon without an inline explanation, no exclamation marks except real PRs, and the Coach never sounds disappointed.

**Same insight, three ways** (Smith incline 135 → 145; last time 10, 10, 10 with ~2 left):
1. "Smith incline goes to 145 lb. You owned 135 last Monday: 10, 10, 10 with two in the tank each set."
2. "Time to move up on incline: 145 lb today. Three sets of 10 at 135 means the range is done; expect 8 or 9 reps at the new weight."
3. "Last week's 135 × 10 × 3 was the top of your 8–10 range, so the bar gets heavier: 145 lb, aiming for 8+."

---

## 6. Example messages

Numbers are illustrative (Office equipment; real stack steps get confirmed during the build).

**1 · First workout, calibration (beginner, leg press)**
> **Let's find your leg press weight.** Start at 90 lb for 10, then tell me how many more you could have done.
> *(after "4+")* That was easy. Next set: 110 lb for 10.
> *(after "2")* Found it: 110 lb × 10 with about 2 left. That's your starting weight; we'll build from here. · *Early read · 1 session*

**2 · Steady progress (intermediate, muscle)**
> **Smith incline: 135 → 145 lb.** You hit 10, 10, 10 last Monday with about 2 left each set, the top of your 8–10 range. Expect 8 or 9 reps at the new weight. [Apply] [Not now] [Why?] · *Confident · 7 sessions*
>
> *Why?* Reps climb inside a range; once you own the top of it, the load goes up and the reps reset. It's the most reliable way to keep adding challenge without guessing. (ACSM 2009; Plotkin 2022)

**3a · Missed reps, muscle goal (lat pulldown)**
> **Lat pulldown: 150 → 140 lb next time, same 10–12 target.** You got 9, 7, 6, and the first set already had nothing left. One plate lighter keeps every set in range; muscle grows across a wide range of weights as long as the sets are hard. · *Fairly sure · 4 sessions*

**3b · Missed reps, strength goal (Smith squat)**
> **Keep 185 lb on the Smith squat, but aim for 4–6 instead of 6–8 for two sessions.** You hit 5, 5, 4: the weight is right for strength work (about 85% of your estimated max), the rep target was a notch too high. Then we build back to 6s.

**4 · Easy session (leg curl)**
> **Leg curl jumps two steps: 100 → 115 lb.** 15, 15, 15 and every set rated 4+ left. One step would still be easy, so we're skipping ahead.

**5 · Plateau (shoulder press)**
> **Shoulder press has stalled at about 120 lb (estimated max) for 4 sessions.** You've done 8–10 reps for 7 weeks straight. For the next 4 weeks, switch to 12–15 reps at 85 lb, then come back to heavier sets fresher. [Change rep range] [Swap to seated DB press] [Not now]
>
> *Why?* When the same stimulus stops working, a planned change usually restarts progress. Size and strength respond across many rep ranges, so a lighter block costs little. (Schoenfeld 2021; Kassiano 2022)

**6 · Rough patch → early lighter week**
> **Take your lighter week now, two weeks early.** Three signs line up: leg press and incline felt 1–2 reps harder at the same weights, your estimated max dipped on 4 of your 6 main lifts, and you logged low energy after 3 of the last 4 sessions. Lighter week: same exercises, about 40% fewer sets, ~10% lighter, stopping 3–4 reps short. [Start lighter week] [Not now] · *Fairly sure · 2 weeks of data*

**7 · Back after 3 weeks**
> **Welcome back. It's been 23 days.** Today runs about 10% lighter with one set fewer per exercise; next session goes to ~95%, then we're back on plan. Strength returns fast after a break (one study saw full recovery within about 5 weeks after 10 weeks off), so easing in costs almost nothing and saves you a week of soreness.

**8a · Fat loss, on track**
> **Down 4.2 lb in 5 weeks (0.6% a week), and your strength hasn't budged.** Incline is still 135 × 9 and leg press 200 × 12. That's exactly what a good cut looks like: holding strength while the scale moves.

**8b · Fat loss, too fast**
> **Your weight has dropped about 1.3% a week for 3 weeks**, faster than the 0.5–1% range that best protects muscle. Training stays the same; you might ease the deficit a little. Your call.

**9 · Pain flag**
> **You flagged your right shoulder on lateral raises.** Next time we'll use the cable lateral raise on the FTS, lighter, stopping 3+ reps short, and only through a range that doesn't hurt. Stop any exercise that hurts. If it hasn't improved in a week or two, or it's sharp, swollen or getting worse, see a doctor or physio.

**10 · In-session adjustment**
> That set was much harder than planned: 8 reps with nothing left at 200. **Next two sets: 180 lb for 10–12.** [Use 180] [Keep 200]

**11 · Short on time (45 min instead of 60)**
> **45-minute Lower A:** Smith squat, Smith RDL and leg press keep all their sets. Leg curl and calf press become a superset with 60 s rest. Leg extension is out today, since quads already got 9 sets this week. About 44 min.

**12 · Weekly review (excerpt)**
> **Week 5 · 5 of 5 sessions · 3-week streak.** Side delts 14 sets and chest 12, both in range. Hamstrings got 6, below 10 for the second week, so Lower A gets one extra set of leg curls [Apply]. Incline and leg press both set PRs. Next week is your planned lighter week.

**13 · Wins**
> **New best: Smith incline 145 × 9.** That's an estimated 189 lb max, up 11 lb since September 8.
> **Four weeks, every planned session.** Your longest streak yet.

---

## 7. Where evidence is mixed: the conservative choices
| Question | Evidence | Atlas's choice |
|---|---|---|
| How close to failure? | ACSM: 2–3 left is enough. A meta-regression: a bit closer helps size. | 2 left on compounds, 1–2 on isolation. Near 0 only on an isolation final set. Never on heavy Smith or hinge lifts. |
| Deloads? | Survey and consensus support; one trial found a week off blunted strength. | Reduced (not stopped) lighter weeks, scheduled or signal-triggered. |
| Periodization? | Not superior. | Simple effort ramp for fatigue management only. |
| Volume ceiling? | Plateau near 18–20 (ACSM) vs. diminishing returns to ~30 fractional (Pelland). | Cap at 20 fractional sets/muscle/week. |
| Rest? | >60–90 s fine for size; longer for heavy compounds. | 2:00–3:00 compounds, 1:00–1:15 isolation, floors enforced. |
| Return-after-break percentages? | Direction is clear; exact numbers aren't tested. | Conservative ramp table (G3). |
| Push/pull ratio? | Association only. | Pull ≥ push, low priority. |
| Swap conversions? | No direct evidence. | Catalog estimate × 0.9, then calibrate in-session. |
| Readiness? | Sensitive, but not prescriptive. | Optional. Offers a lighter day, never forces one. |
| Experience-specific volume for beginners? | Mostly extrapolated. | Start 8–12, ramp to ≥10 over 4–6 weeks. |

## 8. Guardrails and scope
- No medical claims, diagnosis or treatment; pain always leads to reduce/swap and professional advice when persistent.
- No nutrition prescriptions. The weight-trend flag is the only diet-adjacent message, plus one optional monthly protein tip.
- Not for people with medical conditions, pregnancy or under 18. Onboarding has a one-line note suggesting a doctor's OK if any apply.
- The Coach never auto-changes the program. Every program change is a card with Apply. In-session tweaks are a single Use/Keep.

## 9. What I'd like you to confirm
1. The **experience and goal tables** (section 3), especially the lighter-week cadence (5–8 weeks) and starting reps left.
2. **A4's split:** muscle/fat-loss goals lower the load after a clear miss, while the strength goal keeps the load and drops the rep target.
3. The **readiness design** (C0–C2): off switch on the sheet, toggles in Settings, wearable score off by default.
4. The **effort scale** wording: "How many more could you have done? 0 · 1 · 2 · 3 · 4+".
5. Anything you want the Coach to **never** say or do.

---

## Build notes (stage 4)

Clarifications made while building, found by scenario tests and a walkthrough with realistic data:

- **A4:** two *small* misses in a row (only the last set short) hold the weight; "second miss" lowers it only when at least one of the two was a clear miss.
- **A3:** the jump is capped (10% for beginners and early reads, 15% otherwise); when the cap allows only one step, it's a normal A2 move.
- **B1:** on equipment with big gaps (the Office Smith: 85 → 125 → 135), the offer is the weight predicted to land closest to the rep range, not the middle of the range rounded down (which could mean 135 → 85).
- **D:** a lift at the top of its range is ready to move up, not stalled. At most two plateau changes are suggested at once, key lifts first ("never shuffled for novelty").
- **E4:** one volume change per muscle per week (after Apply, that muscle waits 7 days).
- **G1:** "Do it today" starts the missed session today; the rest of the week isn't rescheduled.
- **Confidence "consistent trend"** is read as: no missed reps in the last 3 exposures.
- **Coach output** is computed from saved data in one app store rather than stored separately; only "shown" marks and decisions are written (to `coachLog`).

Not built yet:
- B3 across sessions (shortening an isolation lift's default rest by 15 s after consistent early starts). In-session B3 advice is built.
- The 3-month experience re-check (3.1).
- Body-weight entry UI (stage 5); the H3 rules already run on any measurements saved.
- Message variety: 2–5 interchangeable phrasings per part (titles, evidence, actions) rather than 8–12; with rotation that avoids the last 5 used, frequent messages still read differently from session to session.

## Sources
1. Currier BS, D'Souza AC, Fiatarone Singh MA, et al. (Phillips SM, chair). ACSM Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Med Sci Sports Exerc.* 2026;58(4):851–872. doi:10.1249/MSS.0000000000003897 · [PMC12965823](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823)
2. Ratamess NA, et al. ACSM Position Stand: Progression models in resistance training for healthy adults. *Med Sci Sports Exerc.* 2009;41(3):687–708.
3. Pelland JC, Remmert JF, Robinson ZP, et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Med.* 2026;56(2):481–505 (online Dec 2025). doi:10.1007/s40279-025-02344-w
4. Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. *J Sports Sci.* 2017;35(11):1073–1082.
5. Baz-Valle E, et al. A Systematic Review of the Effects of Different Resistance Training Volumes on Muscle Hypertrophy. *J Hum Kinet.* 2022;81:199–210. doi:10.2478/hukin-2022-0017
6. Schoenfeld BJ, Grgic J, Krieger J. How many times per week should a muscle be trained to maximize muscle hypertrophy? *J Sports Sci.* 2019;37(11):1286–1295.
7. Robinson ZP, et al. Exploring the dose–response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy. *Sports Med.* 2024;54(9):2209–2231. doi:10.1007/s40279-024-02069-2
8. Refalo MC, et al. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. *Sports Med.* 2023;53(3):649–665. doi:10.1007/s40279-022-01784-y
9. Grgic J, et al. Effects of resistance training performed to repetition failure or non-failure on muscular strength and hypertrophy. *J Sport Health Sci.* 2022;11(2):202–211.
10. Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL. Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum. *Sports.* 2021;9(2):32. doi:10.3390/sports9020032
11. Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and hypertrophy adaptations between low- vs. high-load resistance training. *J Strength Cond Res.* 2017;31(12):3508–3523.
12. Plotkin D, et al. Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations. *PeerJ.* 2022;10:e14142. doi:10.7717/peerj.14142
13. Halperin I, et al. Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Med.* 2022;52(2):377–390. PMID 34542869
14. Helms ER, Cronin J, Storey A, Zourdos MC. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. *Strength Cond J.* 2016;38(4):42–49. doi:10.1519/SSC.0000000000000218
15. Zourdos MC, et al. Novel Resistance Training–Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. *J Strength Cond Res.* 2016;30(1):267–275.
16. Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy. *Sports Med Open.* 2022;8:9. doi:10.1186/s40798-021-00404-9
17. Kassiano W, et al. Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review. *J Strength Cond Res.* 2022;36(6):1753–1762. doi:10.1519/JSC.0000000000004258
18. Schoenfeld BJ, et al. Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men. *J Strength Cond Res.* 2016;30(7):1805–1812.
19. Grgic J, Lazinica B, Mikulic P, Krieger JW, Schoenfeld BJ. The effects of short versus long inter-set rest intervals in resistance training on measures of muscle hypertrophy. *Eur J Sport Sci.* 2017;17(8):983–993. doi:10.1080/17461391.2017.1340524
20. Singer A, et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. *Front Sports Act Living.* 2024;6:1429789. doi:10.3389/fspor.2024.1429789
21. Willardson JM. A brief review: factors affecting the length of the rest interval between resistance exercise sets. *J Strength Cond Res.* 2006;20(4):978–984.
22. Bell L, et al. Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach. *Sports Med Open.* 2023;9:87. doi:10.1186/s40798-023-00633-0
23. Rogerson D, et al. Deloading Practices in Strength and Physique Sports: A Cross-sectional Survey. *Sports Med Open.* 2024;10:26. doi:10.1186/s40798-024-00691-y
24. Coleman M, et al. Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. *PeerJ.* 2024;12:e16777. doi:10.7717/peerj.16777
25. Bosquet L, et al. Effect of training cessation on muscular performance: a meta-analysis. *Scand J Med Sci Sports.* 2013;23(3):e140–e149. doi:10.1111/sms.12047
26. Halonen EJ, Gabriel I, Kelahaara MM, Ahtiainen JP, Hulmi JJ. Does Taking a Break Matter: Adaptations in Muscle Strength and Size Between Continuous and Periodic Resistance Training. *Scand J Med Sci Sports.* 2024;34(10):e14739. doi:10.1111/sms.14739
27. Seaborne RA, et al. Human Skeletal Muscle Possesses an Epigenetic Memory of Hypertrophy. *Sci Rep.* 2018;8:1898. doi:10.1038/s41598-018-20287-3
28. Murphy C, Koehler K. Energy deficiency impairs resistance training gains in lean mass but not strength: a meta-analysis and meta-regression. *Scand J Med Sci Sports.* 2022;32(1):125–137. doi:10.1111/sms.14075
29. Spiering BA, Mujika I, Sharp MA, Foulis SA. Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time. *J Strength Cond Res.* 2021;35(5):1449–1458. doi:10.1519/JSC.0000000000003964
30. Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *J Int Soc Sports Nutr.* 2014;11:20. doi:10.1186/1550-2783-11-20
31. Garthe I, et al. Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes. *Int J Sport Nutr Exerc Metab.* 2011;21(2):97–104.
32. Schumann M, et al. Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis. *Sports Med.* 2022;52:601–612. doi:10.1007/s40279-021-01587-7
33. Helms ER, Fitschen PJ, Aragon AA, Cronin J, Schoenfeld BJ. Recommendations for natural bodybuilding contest preparation: resistance and cardiovascular training. *J Sports Med Phys Fitness.* 2015;55(3):164–178.
34. Craven J, et al. Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review. *Sports Med.* 2022;52(11):2669–2690. PMID 35708888
35. Saw AE, Main LC, Gastin PB. Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures. *Br J Sports Med.* 2016;50(5):281–291.
36. Iversen VM, et al. No Time to Lift? Designing Time-Efficient Training Programs for Strength and Hypertrophy. *Sports Med.* 2021;51(10):2079–2095. doi:10.1007/s40279-021-01490-1
37. Rhea MR, Alvar BA, Burkett LN, Ball SD. A meta-analysis to determine the dose response for strength development. *Med Sci Sports Exerc.* 2003;35(3):456–464.
38. Reynolds JM, Gordon TJ, Robergs RA. Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry. *J Strength Cond Res.* 2006;20(3):584–592.
39. Epley B. Poundage Chart. Boyd Epley Workout, 1985 (the Epley estimate).
40. Kolber MJ, et al. Characteristics of shoulder impingement in the recreational weight-training population. *J Strength Cond Res.* 2009. doi:10.1519/JSC.0b013e31818eafb4
41. Negrete RJ, Hanney WJ, Pabian P, Kolber MJ. Upper body push and pull strength ratio in recreationally active adults. *Int J Sports Phys Ther.* 2013;8(2):138–144. [PMC3625793](https://pmc.ncbi.nlm.nih.gov/articles/PMC3625793)
42. nidirect (NHS Northern Ireland). Sports injuries. [nidirect.gov.uk/conditions/sports-injuries](https://nidirect.gov.uk/conditions/sports-injuries). Also NHS Wales 111: Sports injuries.
43. Morton RW, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. *Br J Sports Med.* 2018;52(6):376–384.
