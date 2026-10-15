import type { Gym, ProgramSlot } from '../../db/types';
import { requireExercise } from '../../domain/catalog';
import { loadSourceFor } from '../../domain/gym';
import { describeLoad } from '../../domain/loads';
import { swapOptions } from '../../domain/resolver';
import { startSuggestion } from '../../domain/start';
import type { ExerciseDef } from '../../domain/types';
import { muscleName } from '../../domain/volume';
import { effortLabel, formatLoad, restLabel, setsAndReps } from '../../lib/training-format';
import { profile } from '../../app/state';
import { exerciseHistory } from '../../app/workout';
import { lastExposure } from '../../domain/workout';
import { Sheet } from '../../ui/Sheet';
import './plan.css';

interface ExerciseSheetProps {
  slot: ProgramSlot | null;
  gym: Gym;
  onClose: () => void;
}

/** Everything about one exercise in the plan: the prescription, starting weight, form and swaps. */
export function ExerciseSheet({ slot, gym, onClose }: ExerciseSheetProps) {
  const exercise = slot ? requireExercise(slot.exerciseId) : null;
  return (
    <Sheet open={slot !== null} onClose={onClose} title={exercise?.name}>
      {slot && exercise && <ExerciseDetail slot={slot} gym={gym} />}
    </Sheet>
  );
}

/** Setup, cues and what to watch for. */
export function FormNotes({ exercise }: { exercise: ExerciseDef }) {
  return (
    <section class="ex-form">
      <p class="ex-section-title">Setup</p>
      <p>{exercise.form.setup}</p>
      <p class="ex-section-title">Cues</p>
      <ol>
        {exercise.form.cues.map((cue) => (
          <li key={cue}>{cue}</li>
        ))}
      </ol>
      <p class="ex-section-title">Watch for</p>
      <ul>
        {exercise.form.watch.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ExerciseDetail({ slot, gym }: { slot: ProgramSlot; gym: Gym }) {
  const exercise = requireExercise(slot.exerciseId);
  const source = loadSourceFor(exercise, gym);
  const current = profile.value;
  const start = current ? startSuggestion(slot, gym, current, current.experience) : { kind: 'none' as const };
  const last = lastExposure(exerciseHistory.value, exercise.id);
  const swaps = swapOptions(exercise.id, gym, { experience: current?.experience, limit: 4 });
  const settingsFields = [...new Set([...(source?.item.settingsFields ?? []), ...(exercise.settings ?? [])])];
  // "Pin at 20" adds nothing next to "20 lb"; plates, add-ons and dumbbell pairs do.
  const loadDetail = (load: number) => {
    if (!source) return '';
    const detail = describeLoad(source.model, load, exercise.loadMode).detail;
    return /^Pin at [\d.]+$/.test(detail) ? '' : ` · ${detail}`;
  };
  const muscles = [...exercise.primary.map(muscleName), ...exercise.secondary.map((m) => `${muscleName(m)} (assists)`)];

  return (
    <div class="ex-detail">
      {slot.purpose && <p class="ex-purpose">{slot.purpose}</p>}

      <div class="ex-facts">
        <div class="ex-fact">
          <span class="ex-fact-label">Target</span>
          <span class="ex-fact-value num">{setsAndReps(slot, exercise)}</span>
        </div>
        <div class="ex-fact">
          <span class="ex-fact-label">Effort</span>
          <span class="ex-fact-value">{effortLabel(slot.rir)}</span>
        </div>
        <div class="ex-fact">
          <span class="ex-fact-label">Rest</span>
          <span class="ex-fact-value num">{restLabel(slot.restSec).replace('Rest ', '') || '–'}</span>
        </div>
      </div>

      {last && source ? (
        <div class="ex-start">
          <p class="ex-section-title">Last time</p>
          <p class="num">
            {last.sets.map((s) => `${s.load ?? 0} × ${s.reps}`).join(', ')} <span class="ex-muted">{gym.units}</span>
          </p>
          {source.item.loadNote && <p class="ex-muted ex-small">{source.item.loadNote}</p>}
        </div>
      ) : start.kind !== 'none' && source && (
        <div class="ex-start">
          <p class="ex-section-title">First session</p>
          {start.kind === 'known' ? (
            <p>
              Start at <strong class="num">{formatLoad(start.load)}</strong>
              <span class="ex-muted">{loadDetail(start.load)}</span>, from the set you entered.
            </p>
          ) : (
            <p>
              Start light{start.load !== null && (
                <>
                  {' '}at <strong class="num">{formatLoad(start.load)}</strong>
                  <span class="ex-muted">{loadDetail(start.load)}</span>
                </>
              )}
              . Rate each set and Atlas finds your working weight.
            </p>
          )}
          {source.item.loadNote && <p class="ex-muted ex-small">{source.item.loadNote}</p>}
        </div>
      )}

      <FormNotes exercise={exercise} />

      {muscles.length > 0 && (
        <section>
          <p class="ex-section-title">Works</p>
          <p class="ex-muted">{muscles.join(', ')}</p>
        </section>
      )}

      {source && (
        <section>
          <p class="ex-section-title">Equipment</p>
          <p class="ex-muted">
            {source.item.name}
            {settingsFields.length > 0 && ` · Worth noting: ${settingsFields.map((f) => f.toLowerCase()).join(', ')}.`}
          </p>
        </section>
      )}

      {swaps.length > 0 && (
        <section>
          <p class="ex-section-title">If it’s taken</p>
          <p class="ex-muted">{swaps.map((s) => s.exercise.name).join(' · ')}</p>
        </section>
      )}
    </div>
  );
}
