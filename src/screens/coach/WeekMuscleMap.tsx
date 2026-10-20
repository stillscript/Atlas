import type { MuscleId, WeeklyReview } from '../../coach/types';
import { weekMuscles } from '../../domain/progress';
import { muscleName } from '../../domain/volume';
import { BodyMap } from '../../ui/BodyMap';
import './coach.css';

/**
 * This week's training on the body: each muscle shaded by how close its sets came to the low end of
 * its target range, with the muscles at target and those still behind written out beside it.
 */
export function WeekMuscleMap({ muscles }: { muscles: WeeklyReview['muscles'] }) {
  const week = weekMuscles(muscles);
  const names = (list: MuscleId[]) => list.map(muscleName).join(', ');
  return (
    <div class="week-map">
      <BodyMap level={week.level} />
      <div class="week-map-text">
        <div class="week-map-scale" aria-hidden="true">
          <span class="week-map-ramp" />
          <span class="week-map-ends">
            <span>None</span>
            <span>At target</span>
          </span>
        </div>
        {week.onTarget.length > 0 && (
          <p>
            <strong>At target</strong> {names(week.onTarget)}
          </p>
        )}
        {week.below.length > 0 && (
          <p>
            <strong>Still to go</strong> {names(week.below.slice(0, 4))}
            {week.below.length > 4 ? ` and ${week.below.length - 4} more` : ''}
          </p>
        )}
        {week.onTarget.length === 0 && week.below.length === 0 && <p>Nothing logged yet this week.</p>}
      </div>
    </div>
  );
}
