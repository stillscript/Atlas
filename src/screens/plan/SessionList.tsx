import type { Gym, Profile, ProgramDay, ProgramSlot } from '../../db/types';
import { exerciseHistory } from '../../app/workout';
import type { SessionPlan, SlotPlan } from '../../coach/types';
import { liftingExtras, requireExercise } from '../../domain/catalog';
import { suggestFirstSet } from '../../domain/workout';
import { haptic } from '../../lib/haptics';
import { effortLabel, formatLoad, setsAndReps, uniformEffort } from '../../lib/training-format';
import { ExerciseIcon } from '../../ui/ExerciseIcon';
import { Icon } from '../../ui/Icon';
import './plan.css';

interface SessionListProps {
  day: ProgramDay;
  gym: Gym;
  profile: Profile | null;
  onOpen: (slot: ProgramSlot) => void;
  /** Show each exercise's purpose line (Plan) or keep rows compact (Today). */
  showPurpose?: boolean;
  /** The Coach's plan for this day (Today), so the weights shown are the ones the session will use. */
  plan?: SessionPlan | null;
}

/** A day's exercises in order, with supersets grouped and first-session weights. */
export function SessionList({ day, gym, profile, onOpen, showPurpose = false, plan }: SessionListProps) {
  // When the whole day shares one effort target, the parent says it once instead of on each row.
  const showEffort = uniformEffort(day.slots.filter((s) => requireExercise(s.exerciseId).metric === 'reps')) === undefined;
  const groups: ProgramSlot[][] = [];
  for (const slot of day.slots) {
    const last = groups[groups.length - 1];
    if (slot.superset && last?.[0]?.superset === slot.superset) last.push(slot);
    else groups.push([slot]);
  }
  let number = 0;
  return (
    <ol class="session-list">
      {groups.map((group) => (
        <li key={group[0]!.id} class={group.length > 1 ? 'session-group is-superset' : 'session-group'}>
          {group.length > 1 && (
            <p class="superset-label">
              <Icon name="link" size={14} />
              Superset: do these back to back, then rest
            </p>
          )}
          {group.map((slot) => {
            number++;
            return (
              <SlotRow
                key={slot.id}
                number={number}
                slot={slot}
                gym={gym}
                profile={profile}
                showPurpose={showPurpose}
                showEffort={showEffort}
                onOpen={onOpen}
                slotPlan={plan?.slots[slot.id]}
              />
            );
          })}
        </li>
      ))}
      {(liftingExtras(day.extras) ?? []).map((extra) => (
        <li key={extra.id} class="session-group">
          <div class="slot-row is-extra">
            <ExerciseIcon exerciseId={extra.exerciseId} badge="+" />
            <span class="slot-text">
              <span class="slot-name">{extra.label}</span>
              <span class="slot-meta">
                {[requireExercise(extra.exerciseId).name, extra.detail]
                  .filter((part) => part && part.toLowerCase() !== extra.label.toLowerCase())
                  .join(' · ')}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SlotRow({
  number,
  slot,
  gym,
  profile,
  showPurpose,
  showEffort,
  onOpen,
  slotPlan,
}: {
  number: number;
  slot: ProgramSlot;
  gym: Gym;
  profile: Profile | null;
  showPurpose: boolean;
  showEffort: boolean;
  onOpen: (slot: ProgramSlot) => void;
  slotPlan?: SlotPlan;
}) {
  const exercise = requireExercise(slot.exerciseId);
  // The same weight the workout will pre-fill: the Coach's (applied, or a lighter week), last
  // time's, the one entered at setup, or a light guess.
  const suggestion = profile ? suggestFirstSet(slot.exerciseId, slot, { gym, profile, history: exerciseHistory.value }) : null;
  const coachLoad =
    slotPlan?.auto?.load !== undefined ? slotPlan.auto.load : slotPlan?.offer?.decided === 'applied' ? slotPlan.offer.load : undefined;
  const load = coachLoad !== undefined ? coachLoad : (suggestion?.load ?? null);
  const light = coachLoad === undefined && suggestion?.reason === 'calibrate';
  return (
    <button
      type="button"
      class="slot-row"
      onClick={() => {
        haptic('tap');
        onOpen(slot);
      }}
    >
      <ExerciseIcon exerciseId={slot.exerciseId} badge={number} />
      <span class="slot-text">
        <span class="slot-name">{exercise.name}</span>
        <span class="slot-meta num">
          {setsAndReps(slot, exercise)}
          {showEffort && slot.rir !== undefined && exercise.metric === 'reps' ? ` · ${effortLabel(slot.rir)}` : ''}
        </span>
        {showPurpose && slot.purpose && <span class="slot-purpose">{slot.purpose}</span>}
      </span>
      {load !== null && suggestion?.reason !== 'bodyweight' && (
        <span
          class={light ? 'slot-load is-light num' : 'slot-load num'}
          title={light ? 'A light first guess; your first sets find the real weight' : undefined}
        >
          {light ? '~' : ''}
          {formatLoad(load, gym.units)}
        </span>
      )}
      <Icon name="chevron-right" size={18} class="slot-chevron" />
    </button>
  );
}
