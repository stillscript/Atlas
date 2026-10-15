import type { Gym, Profile, ProgramDay, ProgramSlot } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { startSuggestion } from '../../domain/start';
import { haptic } from '../../lib/haptics';
import { effortLabel, formatLoad, setsAndReps, uniformEffort } from '../../lib/training-format';
import { Icon } from '../../ui/Icon';
import './plan.css';

interface SessionListProps {
  day: ProgramDay;
  gym: Gym;
  profile: Profile | null;
  onOpen: (slot: ProgramSlot) => void;
  /** Show each exercise's purpose line (Plan) or keep rows compact (Today). */
  showPurpose?: boolean;
}

/** A day's exercises in order, with supersets grouped and first-session weights. */
export function SessionList({ day, gym, profile, onOpen, showPurpose = false }: SessionListProps) {
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
              />
            );
          })}
        </li>
      ))}
      {(day.extras ?? []).map((extra) => (
        <li key={extra.id} class="session-group">
          <div class="slot-row is-extra">
            <span class="slot-num" aria-hidden="true">
              <Icon name="plus" size={14} />
            </span>
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
}: {
  number: number;
  slot: ProgramSlot;
  gym: Gym;
  profile: Profile | null;
  showPurpose: boolean;
  showEffort: boolean;
  onOpen: (slot: ProgramSlot) => void;
}) {
  const exercise = requireExercise(slot.exerciseId);
  const start = profile ? startSuggestion(slot, gym, profile, profile.experience) : { kind: 'none' as const };
  return (
    <button
      type="button"
      class="slot-row"
      onClick={() => {
        haptic('tap');
        onOpen(slot);
      }}
    >
      <span class="slot-num num" aria-hidden="true">
        {number}
      </span>
      <span class="slot-text">
        <span class="slot-name">{exercise.name}</span>
        <span class="slot-meta num">
          {setsAndReps(slot, exercise)}
          {showEffort && slot.rir !== undefined && exercise.metric === 'reps' ? ` · ${effortLabel(slot.rir)}` : ''}
        </span>
        {showPurpose && slot.purpose && <span class="slot-purpose">{slot.purpose}</span>}
      </span>
      {start.kind === 'known' && <span class="slot-load num">{formatLoad(start.load)}</span>}
      {start.kind === 'calibrate' && start.load !== null && (
        <span class="slot-load is-light num" title="A light first guess; your first sets find the real weight">
          ~{formatLoad(start.load)}
        </span>
      )}
      <Icon name="chevron-right" size={18} class="slot-chevron" />
    </button>
  );
}
