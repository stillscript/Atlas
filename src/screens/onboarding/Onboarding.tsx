import { useMemo, useRef, useState } from 'preact/hooks';
import { gyms } from '../../app/edit';
import { navigate } from '../../app/router';
import { saveOnboarding } from '../../app/repo';
import {
  activeGym,
  activeProgram,
  appMeta,
  getDb,
  profile as profileSignal,
  redoingSetup,
  settings,
} from '../../app/state';
import type { Experience, Goal, Gym, Sex } from '../../db/types';
import { EQUIPMENT, GYM_PRESETS, PROGRAMMING, requireExercise, templateById } from '../../domain/catalog';
import { estimateDayMinutes, type BuiltProgram } from '../../domain/generator';
import { loadSourceFor } from '../../domain/gym';
import { availableLoads, describeLoad } from '../../domain/loads';
import { buildGym, buildProfile, buildProgram, keyLifts, type OnboardingAnswers } from '../../domain/onboarding';
import { startingLoad } from '../../domain/resolver';
import { sessionOn, WEEKDAY_LONG, WEEKDAY_SHORT, addDays, startOfDay } from '../../domain/schedule';
import type { EquipmentDef } from '../../domain/types';
import { haptic } from '../../lib/haptics';
import { ChoiceCard, PillToggle, Stepper } from '../../ui/choices';
import { Button, Toggle } from '../../ui/controls';
import { showToast } from '../../ui/feedback';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import './onboarding.css';

type StepId = 'welcome' | 'goal' | 'days' | 'length' | 'experience' | 'about' | 'gym' | 'equipment' | 'plan' | 'weights' | 'done';

const QUESTION_STEPS: StepId[] = ['goal', 'days', 'length', 'experience', 'about', 'gym', 'plan', 'weights'];

const GOALS: { value: Goal; title: string; description: string; icon: 'dumbbell' | 'flame' | 'barbell' | 'pulse' }[] = [
  { value: 'muscle', title: 'Build muscle', description: 'Grow size and shape with steady progress.', icon: 'dumbbell' },
  { value: 'fat-loss', title: 'Lose fat, keep muscle', description: 'Hold your strength while your weight comes down.', icon: 'flame' },
  { value: 'strength', title: 'Get stronger', description: 'Heavier weights on the big lifts.', icon: 'barbell' },
  { value: 'general', title: 'General fitness', description: 'Feel strong and healthy, build the habit.', icon: 'pulse' },
];

const LENGTHS: { value: number; title: string; description: string }[] = [
  { value: 30, title: '30 minutes', description: 'Quick: the big lifts that matter most.' },
  { value: 45, title: '45 minutes', description: 'Focused: the essentials, with some extras paired up.' },
  { value: 60, title: '60 minutes', description: 'The standard: room for everything.' },
  { value: 75, title: '75 minutes', description: 'Plenty of time for extra work.' },
  { value: 90, title: '90 minutes', description: 'Long sessions, full rests.' },
];

const LEVELS: { value: Experience; title: string; description: string; icon: 'sprout' | 'progress' | 'mountain' }[] = [
  { value: 'beginner', title: 'New to lifting', description: 'Or back after a long break. Atlas keeps it simple and steady.', icon: 'sprout' },
  { value: 'intermediate', title: 'Some experience', description: 'You’ve trained consistently for 6 months or more.', icon: 'progress' },
  { value: 'advanced', title: 'Experienced', description: 'Two years or more, and you know your numbers.', icon: 'mountain' },
];

/** Only sets the starting leg exercises (domain/legStyle). */
const SEXES: { value: Sex; title: string; description: string }[] = [
  { value: 'male', title: 'Man', description: 'Legs on machines: leg press, curls and extensions.' },
  { value: 'female', title: 'Woman', description: 'Squats, deadlifts and lunges, plus hip thrusts for glutes.' },
  { value: 'unspecified', title: 'Rather not say', description: 'Squats, deadlifts and lunges.' },
];

const CATEGORY_NAMES: Record<string, string> = {
  'free-weight': 'Free weights',
  support: 'Benches and racks',
  machine: 'Machines',
  cable: 'Cables',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

const MIN_DAYS = 2;
const MAX_DAYS = 6;
const AUTO_ADVANCE_MS = 220;

function weekPreview(built: BuiltProgram): string {
  return built.program.schedule
    .map((id, weekday) => (id ? `${WEEKDAY_SHORT[weekday]} ${built.program.days.find((d) => d.id === id)?.name ?? ''}` : null))
    .filter(Boolean)
    .join(' · ');
}

function averageMinutes(built: BuiltProgram): number {
  const minutes = built.program.days.map(estimateDayMinutes);
  return Math.round(minutes.reduce((a, b) => a + b, 0) / Math.max(1, minutes.length) / 5) * 5;
}

export function Onboarding() {
  const redo = redoingSetup.value;
  const [step, setStep] = useState<StepId>('welcome');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [trainingDays, setTrainingDays] = useState<number[]>(PROGRAMMING.defaultTrainingDays['3']!);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [gymChoice, setGymChoice] = useState<string | null>(null); // preset id or 'custom'
  const [customName, setCustomName] = useState('');
  const [customEquipment, setCustomEquipment] = useState<string[]>([]);
  const [plan, setPlan] = useState<'auto' | 'pillar' | null>(null);
  const [weightsMode, setWeightsMode] = useState<'calibrate' | 'enter' | null>(null);
  const [startingLoads, setStartingLoads] = useState<Record<string, { load: number; reps: number }>>({});
  const [saving, setSaving] = useState(false);
  const [daysError, setDaysError] = useState('');
  const advanceTimer = useRef<number>(0);

  const flow: StepId[] = ['welcome', 'goal', 'days', 'length', 'experience', 'about', 'gym', ...(gymChoice === 'custom' ? (['equipment'] as StepId[]) : []), 'plan', 'weights', 'done'];
  const index = flow.indexOf(step);
  const questionIndex = QUESTION_STEPS.indexOf(step === 'equipment' ? 'gym' : step);

  function go(to: StepId, dir: 'forward' | 'back' = 'forward') {
    window.clearTimeout(advanceTimer.current);
    setDirection(dir);
    setStep(to);
    window.scrollTo({ top: 0 });
  }
  const next = () => {
    const target = flow[index + 1];
    if (target) go(target);
  };
  const back = () => {
    const target = flow[index - 1];
    if (target) go(target, 'back');
    else if (redo) redoingSetup.value = false;
  };
  /** Single-choice steps move on by themselves after a beat, so the choice is visible. */
  const chooseAndAdvance = (apply: () => void, to?: StepId) => {
    apply();
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => (to ? go(to) : next()), AUTO_ADVANCE_MS);
  };

  // The gym only changes when its answer does, so its id stays stable while browsing plans.
  const gymAnswer: OnboardingAnswers['gym'] | null =
    gymChoice === null
      ? null
      : gymChoice === 'custom'
        ? { kind: 'custom', name: customName, equipment: customEquipment }
        : { kind: 'preset', presetId: gymChoice };
  // Redoing setup with a preset you already have keeps that gym: its confirmed weights and machine
  // settings carry over instead of starting from the catalog again.
  const gym: Gym | null = useMemo(() => {
    if (!gymAnswer) return null;
    if (gymAnswer.kind === 'preset') {
      const existing = gyms.value.find((g) => g.presetId === gymAnswer.presetId);
      if (existing) return existing;
    }
    return buildGym({ gym: gymAnswer });
  }, [gymChoice, customName, customEquipment.join(',')]);

  const answersFor = (choice: 'auto' | 'pillar'): OnboardingAnswers | null =>
    goal && experience && minutes && sex && gymAnswer
      ? { goal, experience, trainingDays, sessionMinutes: minutes, sex, gym: gymAnswer, plan: choice, startingLoads }
      : null;

  const plans = useMemo(() => {
    if (!gym) return null;
    const auto = answersFor('auto');
    const pillar = answersFor('pillar');
    if (!auto || !pillar) return null;
    return { auto: buildProgram(auto, gym), pillar: buildProgram(pillar, gym) };
  }, [gym, goal, experience, minutes, sex, trainingDays.join(',')]);

  const chosen = plans && plan ? plans[plan] : null;
  const lifts = chosen ? keyLifts(chosen.program) : [];

  async function finish() {
    const answers = plan ? answersFor(plan) : null;
    if (!answers || !gym || !chosen || saving) return;
    setSaving(true);
    try {
      const program = chosen.program;
      const known =
        weightsMode === 'enter' ? Object.fromEntries(Object.entries(startingLoads).filter(([id]) => lifts.includes(id))) : {};
      const newProfile = buildProfile({ ...answers, startingLoads: known }, program);
      const saved = await saveOnboarding(getDb(), { profile: newProfile, gym, program });
      settings.value = saved.settings;
      appMeta.value = saved.app;
      profileSignal.value = newProfile;
      activeGym.value = gym;
      gyms.value = [...gyms.value.filter((g) => g.id !== gym.id), gym];
      activeProgram.value = program;
      haptic('success');
      redoingSetup.value = false;
      navigate('today');
    } catch {
      setSaving(false);
      showToast('Couldn’t save your plan. Try again.', 'danger');
    }
  }

  const header = step !== 'welcome' && step !== 'done' && (
    <header class="ob-header">
      <button type="button" class="ob-back" aria-label="Back" onClick={back}>
        <Icon name="chevron-left" size={24} />
      </button>
      <div
        class="ob-progress"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={QUESTION_STEPS.length}
        aria-valuenow={questionIndex + 1}
      >
        <span style={{ width: `${((questionIndex + 1) / QUESTION_STEPS.length) * 100}%` }} />
      </div>
      <span class="ob-count num">
        {questionIndex + 1}/{QUESTION_STEPS.length}
      </span>
    </header>
  );

  let body = null;
  let footer = null;

  switch (step) {
    case 'welcome':
      body = (
        <div class="ob-welcome">
          <Logo size={72} labelled />
          <h1 class="ob-hero-title">{redo ? 'Let’s rebuild your plan' : 'Strength training that learns from every set'}</h1>
          <p class="ob-lead">
            {redo
              ? 'Answer a few questions again. Your workouts and history stay exactly as they are.'
              : 'A few quick questions, then Atlas builds a plan around the equipment in your gym.'}
          </p>
          <ul class="ob-points">
            <li>
              <Icon name="coach" size={20} />
              <span>A coach that adjusts weights, reps and rest as you go</span>
            </li>
            <li>
              <Icon name="shield" size={20} />
              <span>Everything stays on your phone. No account.</span>
            </li>
            <li>
              <Icon name="clock" size={20} />
              <span>Setup takes under a minute</span>
            </li>
          </ul>
        </div>
      );
      footer = (
        <>
          <Button variant="primary" size="lg" block onClick={next}>
            {redo ? 'Start' : 'Get started'}
          </Button>
          {redo && (
            <Button variant="ghost" block onClick={() => (redoingSetup.value = false)}>
              Keep my current plan
            </Button>
          )}
        </>
      );
      break;

    case 'goal':
      body = (
        <>
          <StepTitle title="What’s your main goal?" lead="Atlas shapes reps, effort and weekly volume around it." />
          <div class="choice-list" role="radiogroup" aria-label="Goal">
            {GOALS.map((g) => (
              <ChoiceCard
                key={g.value}
                icon={g.icon}
                title={g.title}
                description={g.description}
                selected={goal === g.value}
                onSelect={() => chooseAndAdvance(() => setGoal(g.value))}
              />
            ))}
          </div>
        </>
      );
      break;

    case 'days': {
      const count = trainingDays.length;
      body = (
        <>
          <StepTitle title="Which days can you train?" lead="Pick 2 to 6 days. Rest days matter as much as training days." />
          <div class="ob-section">
            <p class="ob-label">Days a week</p>
            <div class="pill-row" role="group" aria-label="Days a week">
              {[2, 3, 4, 5, 6].map((n) => (
                <PillToggle
                  key={n}
                  label={String(n)}
                  ariaLabel={`${n} days a week`}
                  selected={count === n}
                  onToggle={() => {
                    setTrainingDays(PROGRAMMING.defaultTrainingDays[String(n)]!);
                    setDaysError('');
                  }}
                />
              ))}
            </div>
          </div>
          <div class="ob-section">
            <p class="ob-label">On these days</p>
            <div class="ob-weekdays" role="group" aria-label="Training days">
              {WEEKDAY_SHORT.map((label, weekday) => (
                <PillToggle
                  key={label}
                  label={label}
                  ariaLabel={WEEKDAY_LONG[weekday]}
                  selected={trainingDays.includes(weekday)}
                  onToggle={() => {
                    setDaysError('');
                    setTrainingDays((days) =>
                      days.includes(weekday) ? days.filter((d) => d !== weekday) : [...days, weekday].sort((a, b) => a - b),
                    );
                  }}
                />
              ))}
            </div>
            <p class={daysError ? 'ob-hint is-error' : 'ob-hint'} role={daysError ? 'alert' : undefined}>
              {daysError || `${count} ${count === 1 ? 'day' : 'days'} a week`}
            </p>
          </div>
        </>
      );
      footer = (
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            if (count < MIN_DAYS) setDaysError(`Pick at least ${MIN_DAYS} days.`);
            else if (count > MAX_DAYS) setDaysError(`Pick ${MAX_DAYS} days or fewer: one full rest day keeps you recovering.`);
            else next();
          }}
        >
          Continue
        </Button>
      );
      break;
    }

    case 'length':
      body = (
        <>
          <StepTitle title="How long is a session?" lead="Atlas fits each workout into this, including rest." />
          <div class="choice-list" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l) => (
              <ChoiceCard
                key={l.value}
                icon="clock"
                title={l.title}
                description={l.description}
                selected={minutes === l.value}
                onSelect={() => chooseAndAdvance(() => setMinutes(l.value))}
              />
            ))}
          </div>
        </>
      );
      break;

    case 'experience':
      body = (
        <>
          <StepTitle title="How much have you lifted?" lead="This sets how fast Atlas progresses you and how many sets you do." />
          <div class="choice-list" role="radiogroup" aria-label="Experience">
            {LEVELS.map((l) => (
              <ChoiceCard
                key={l.value}
                icon={l.icon}
                title={l.title}
                description={l.description}
                selected={experience === l.value}
                onSelect={() => chooseAndAdvance(() => setExperience(l.value))}
              />
            ))}
          </div>
        </>
      );
      break;

    case 'about':
      body = (
        <>
          <StepTitle title="Who’s training?" lead="This only sets your starting leg exercises. You can switch them anytime in Plan settings." />
          <div class="choice-list" role="radiogroup" aria-label="Who’s training">
            {SEXES.map((s) => (
              <ChoiceCard
                key={s.value}
                title={s.title}
                description={s.description}
                selected={sex === s.value}
                onSelect={() => chooseAndAdvance(() => setSex(s.value))}
              />
            ))}
          </div>
        </>
      );
      break;

    case 'gym':
      body = (
        <>
          <StepTitle title="Where do you train?" lead="Atlas only plans exercises your gym can actually do." />
          <div class="choice-list" role="radiogroup" aria-label="Gym">
            {GYM_PRESETS.map((preset) => (
              <ChoiceCard
                key={preset.id}
                icon="building"
                title={preset.name}
                description={preset.description}
                selected={gymChoice === preset.id}
                onSelect={() => chooseAndAdvance(() => setGymChoice(preset.id), 'plan')}
              />
            ))}
            <ChoiceCard
              icon="plus"
              title="Another gym"
              description="Tick what it has. Takes about 20 seconds."
              selected={gymChoice === 'custom'}
              onSelect={() => chooseAndAdvance(() => setGymChoice('custom'), 'equipment')}
            />
          </div>
        </>
      );
      break;

    case 'equipment':
      body = <EquipmentChecklist name={customName} onName={setCustomName} selected={customEquipment} onChange={setCustomEquipment} />;
      footer = (
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            if (customEquipment.length === 0) showToast('Tick at least one thing your gym has.');
            else next();
          }}
        >
          Continue
        </Button>
      );
      break;

    case 'plan':
      body = (
        <>
          <StepTitle title="Choose your plan" lead="Both use only your gym’s equipment. You can rebuild it anytime in Settings." />
          {plans && (
            <div class="choice-list" role="radiogroup" aria-label="Plan">
              <ChoiceCard
                icon="sparkle"
                title="Built for you"
                badge="Recommended"
                description={`${plans.auto.program.days.length} days a week · about ${averageMinutes(plans.auto)} min each`}
                selected={plan === 'auto'}
                onSelect={() => chooseAndAdvance(() => setPlan('auto'))}
              >
                <span class="ob-week">{weekPreview(plans.auto)}</span>
              </ChoiceCard>
              <ChoiceCard
                icon="plan"
                title={templateById('pillar')?.name ?? 'Pillar'}
                description={`5 days a week · about ${averageMinutes(plans.pillar)} min each · upper-body physique focus`}
                selected={plan === 'pillar'}
                onSelect={() => chooseAndAdvance(() => setPlan('pillar'))}
              >
                <span class="ob-week">{weekPreview(plans.pillar)}</span>
              </ChoiceCard>
            </div>
          )}
        </>
      );
      break;

    case 'weights':
      body = (
        <>
          <StepTitle
            title="Know any of your weights?"
            lead="If you’re not sure, Atlas finds them in your first week: start light, rate each set, and it sets the next weight."
          />
          <div class="choice-list" role="radiogroup" aria-label="Starting weights">
            <ChoiceCard
              icon="coach"
              title="Find them for me"
              description="Best if you’re new, coming back, or unsure."
              selected={weightsMode === 'calibrate'}
              onSelect={() => chooseAndAdvance(() => setWeightsMode('calibrate'), 'done')}
            />
            <ChoiceCard
              icon="dumbbell"
              title="I’ll enter some"
              description="For the main lifts you know well. Skip any you don’t."
              selected={weightsMode === 'enter'}
              onSelect={() => setWeightsMode('enter')}
            />
          </div>
          {weightsMode === 'enter' && gym && experience && (
            <KnownLifts gym={gym} experience={experience} lifts={lifts} values={startingLoads} onChange={setStartingLoads} />
          )}
        </>
      );
      if (weightsMode === 'enter') {
        footer = (
          <Button variant="primary" size="lg" block onClick={next}>
            Continue
          </Button>
        );
      }
      break;

    case 'done': {
      const firstUp = chosen ? firstSession(chosen) : null;
      const known = weightsMode === 'enter' ? Object.keys(startingLoads).length : 0;
      body = (
        <div class="ob-done">
          <span class="ob-done-mark" aria-hidden="true">
            <Icon name="check" size={34} />
          </span>
          <h1 class="ob-hero-title">Your plan is ready</h1>
          {chosen && (
            <ul class="ob-summary">
              <li>
                <span>Plan</span>
                <strong>{plan === 'pillar' ? 'Pillar' : chosen.program.name}</strong>
              </li>
              <li>
                <span>Days</span>
                <strong>{chosen.program.schedule.flatMap((id, weekday) => (id ? [WEEKDAY_SHORT[weekday]] : [])).join(' · ')}</strong>
              </li>
              {firstUp && (
                <li>
                  <span>First up</span>
                  <strong>
                    {firstUp.name}, {firstUp.when}
                  </strong>
                </li>
              )}
            </ul>
          )}
          <p class="ob-lead">
            {known >= lifts.length && lifts.length > 0
              ? 'Your first sessions start from the weights you entered. After each set, rate how it felt and Atlas adjusts.'
              : 'Your first week finds your working weights. Start light, tell Atlas how each set felt, and it sets the next one.'}
          </p>
          <p class="ob-health">
            If you have a medical condition or injury, are pregnant, or are under 18, check with a doctor before starting.
          </p>
        </div>
      );
      footer = (
        <Button variant="primary" size="lg" block disabled={saving} onClick={() => void finish()}>
          {saving ? 'Saving…' : 'Go to Today'}
        </Button>
      );
      break;
    }
  }

  return (
    <div class="ob">
      {header}
      <main key={step} class={`ob-body ob-dir-${direction}`}>
        {body}
      </main>
      {footer && <footer class="ob-footer">{footer}</footer>}
    </div>
  );
}

function firstSession(built: BuiltProgram): { name: string; when: string } | null {
  const today = startOfDay(new Date());
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(today, offset);
    const day = sessionOn(built.program, date);
    if (day) {
      const when = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : WEEKDAY_LONG[(date.getDay() + 6) % 7]!;
      return { name: day.name, when };
    }
  }
  return null;
}

function StepTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <div class="ob-title-block">
      <h1 class="ob-title">{title}</h1>
      {lead && <p class="ob-lead">{lead}</p>}
    </div>
  );
}

function EquipmentChecklist({
  name,
  onName,
  selected,
  onChange,
}: {
  name: string;
  onName: (v: string) => void;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const groups = new Map<string, EquipmentDef[]>();
  for (const item of EQUIPMENT.filter((e) => e.checklist)) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  const order = ['free-weight', 'support', 'machine', 'cable', 'bodyweight', 'other'];
  return (
    <>
      <StepTitle title="What’s in your gym?" lead="Tick everything that’s there. You can change it later." />
      <label class="ob-field">
        <span class="ob-label">Gym name</span>
        <input type="text" value={name} placeholder="Downtown gym" maxLength={40} onInput={(e) => onName(e.currentTarget.value)} />
      </label>
      {order
        .filter((category) => groups.has(category))
        .map((category) => (
          <div key={category} class="ob-section">
            <p class="ob-label">{CATEGORY_NAMES[category]}</p>
            <div class="pill-row">
              {groups.get(category)!.map((item) => (
                <PillToggle
                  key={item.id}
                  label={item.shortName}
                  selected={selected.includes(item.id)}
                  onToggle={() => onChange(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
                />
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

function KnownLifts({
  gym,
  experience,
  lifts,
  values,
  onChange,
}: {
  gym: Gym;
  experience: Experience;
  lifts: string[];
  values: Record<string, { load: number; reps: number }>;
  onChange: (v: Record<string, { load: number; reps: number }>) => void;
}) {
  const repOptions = Array.from({ length: 20 }, (_, i) => i + 1);
  return (
    <div class="ob-lifts">
      <p class="ob-hint">A recent set you did with good form: the weight and how many reps.</p>
      {lifts.map((id) => {
        const exercise = requireExercise(id);
        const source = loadSourceFor(exercise, gym);
        if (!source) return null;
        const loads = availableLoads(source.model).filter((l) => l > 0);
        const value = values[id];
        const toggle = (on: boolean) => {
          const nextValues = { ...values };
          if (on) nextValues[id] = { load: startingLoad(id, gym, experience) ?? loads[0] ?? 0, reps: 8 };
          else delete nextValues[id];
          onChange(nextValues);
        };
        return (
          <div key={id} class={value ? 'ob-lift is-on' : 'ob-lift'}>
            <div class="ob-lift-head">
              <label class="ob-lift-name" for={`lift-${id}`}>
                {exercise.name}
              </label>
              <Toggle id={`lift-${id}`} checked={Boolean(value)} onChange={toggle} label={`I know my ${exercise.name} weight`} />
            </div>
            {value && (
              <div class="ob-lift-steppers">
                <Stepper
                  label="Weight"
                  value={value.load}
                  options={loads}
                  unit={exercise.loadMode === 'per-hand' ? 'lb each' : 'lb'}
                  caption={describeLoad(source.model, value.load, exercise.loadMode).detail}
                  onChange={(load) => onChange({ ...values, [id]: { ...value, load } })}
                />
                <Stepper
                  label="Reps"
                  value={value.reps}
                  options={repOptions}
                  unit={exercise.unilateral ? 'reps each side' : 'reps'}
                  onChange={(reps) => onChange({ ...values, [id]: { ...value, reps } })}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
