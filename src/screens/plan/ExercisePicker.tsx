import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Gym } from '../../db/types';
import { EXERCISES, exerciseById, patternById } from '../../domain/catalog';
import { canDoExercise, gymTags } from '../../domain/gym';
import { muscleName } from '../../domain/volume';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import '../workout/workout.css';
import { ExerciseIcon } from '../../ui/ExerciseIcon';

interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  gym: Gym;
  /** Shown first when nothing is typed (e.g. the same movement for a swap). */
  suggested?: string[];
  /** Already in the session or day: marked, not hidden. */
  current?: string[];
  onPick: (exerciseId: string) => void;
}

/** Every exercise this gym can do, searchable by name, muscle or movement. */
export function ExercisePicker({ open, onClose, title, gym, suggested = [], current = [], onPick }: ExercisePickerProps) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  const available = useMemo(() => {
    const tags = gymTags(gym);
    return EXERCISES.filter((e) => e.kind !== 'cardio' && canDoExercise(e, tags)).sort((a, b) => a.name.localeCompare(b.name));
  }, [gym]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = available.filter((e) => {
    const haystack = `${e.name} ${(e.aka ?? []).join(' ')} ${patternById(e.pattern)?.name ?? ''} ${[...e.primary, ...e.secondary].map(muscleName).join(' ')}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  const suggestions = words.length ? [] : suggested.map(exerciseById).filter((e) => e !== undefined && available.includes(e));
  const rest = words.length ? matches : matches.filter((e) => !suggestions.includes(e));

  const row = (id: string, name: string, meta: string) => (
    <button
      key={id}
      type="button"
      class="swap-option"
      onClick={() => {
        onPick(id);
        onClose();
      }}
    >
      <ExerciseIcon exerciseId={id} size="sm" />
      <span class="swap-text">
        <span class="swap-name">{name}</span>
        <span class="swap-meta">
          {meta}
          {current.includes(id) ? ' · already in it' : ''}
        </span>
      </span>
      <Icon name="chevron-right" size={18} />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        class="field-input search-input"
        type="search"
        placeholder="Search: curl, chest, row…"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        aria-label="Search exercises"
      />
      {suggestions.length > 0 && (
        <>
          <p class="ex-section-title picker-heading">Same movement</p>
          <div class="swap-list">{suggestions.map((e) => row(e!.id, e!.name, e!.primary.map(muscleName).join(', ')))}</div>
          <p class="ex-section-title picker-heading">Everything else</p>
        </>
      )}
      <div class="swap-list">
        {rest.slice(0, 80).map((e) => row(e.id, e.name, e.primary.map(muscleName).join(', ')))}
        {rest.length === 0 && <p class="sheet-copy">Nothing matches “{query}” in this gym.</p>}
      </div>
    </Sheet>
  );
}
