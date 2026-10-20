import { pictogramFor } from '../domain/pictograms';
import { Icon } from './Icon';
import { Pictogram } from './Pictogram';
import './pictogram.css';

const SIZES = { sm: 31, md: 41, lg: 58 } as const;

/**
 * An exercise's pictogram on a soft tile, with an optional badge (its number in the session).
 * Decorative: the exercise name is always next to it.
 */
export function ExerciseIcon({ exerciseId, size = 'md', badge }: { exerciseId: string; size?: keyof typeof SIZES; badge?: string | number }) {
  const art = pictogramFor(exerciseId);
  return (
    <span class={`ex-icon ex-icon-${size}`} aria-hidden="true">
      {art ? <Pictogram pose={art.pose} props={art.props} size={SIZES[size]} /> : <Icon name="dumbbell" size={Math.round(SIZES[size] * 0.7)} />}
      {badge !== undefined && <span class="ex-icon-badge num">{badge}</span>}
    </span>
  );
}
