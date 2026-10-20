import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { groundOf, joints, shapes, svgMarkup } from '../../domain/figure';
import { cueSpots, spotPoint, type CueSpot } from '../../domain/formGuide';
import { motionBox, motionFrames, pictogramFor, type PictogramArt } from '../../domain/pictograms';
import type { ExerciseDef } from '../../domain/types';
import { muscleName } from '../../domain/volume';
import { BodyMap } from '../../ui/BodyMap';
import { Icon } from '../../ui/Icon';
import './plan.css';

/**
 * "How to do it": the exercise's figure moving slowly between its two key positions, with numbered
 * markers where the cues point, then setup, cues, what to watch for and the muscles worked.
 * Reduce Motion shows the two positions side by side instead of moving.
 */

/** One loop: hold the start, move, hold the finish, move back (ms). */
const HOLD = 700;
const MOVE = 1600;
const CYCLE = 2 * (HOLD + MOVE);

/** Where in the movement we are (0 = start, 1 = finish) at a point in the loop, eased. */
function phase(ms: number): number {
  const at = ms % CYCLE;
  const ease = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
  if (at < HOLD) return 0;
  if (at < HOLD + MOVE) return ease((at - HOLD) / MOVE);
  if (at < 2 * HOLD + MOVE) return 1;
  return 1 - ease((at - 2 * HOLD - MOVE) / MOVE);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The figure at `t`, in a fixed frame, with numbered markers on the cue spots. */
function frameMarkup(art: PictogramArt, t: number, frame: [number, number, number, number], spots: (CueSpot | null)[], label: string): string {
  const [pose] = motionFrames(art, [t]);
  const j = joints(pose!);
  const markers = spots
    .map((spot, i) => {
      if (!spot) return '';
      const [x, y] = spotPoint(spot, j);
      return `<g class="cue-marker"><circle cx="${x}" cy="${y}" r="2.35"/><text x="${x}" y="${y + 1.05}" text-anchor="middle">${i + 1}</text></g>`;
    })
    .join('');
  return svgMarkup(shapes(pose!, art.props, groundOf(art.pose, art.props)), 240, label, frame, markers);
}

export function MovementStage({ exercise }: { exercise: ExerciseDef }) {
  const art = useMemo(() => pictogramFor(exercise.id), [exercise.id]);
  const spots = useMemo(() => cueSpots(exercise.form.cues), [exercise.id]);
  const frame = useMemo(() => (art ? motionBox(art) : null), [art]);
  const [reduced] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const moves = Boolean(art?.motion) && !reduced;

  useEffect(() => {
    const node = host.current;
    if (!node || !art || !frame || reduced) return;
    const label = `${exercise.name}, ${art.motion ? 'moving between its start and finish positions' : 'held position'}`;
    if (!moves || !playing) {
      node.innerHTML = frameMarkup(art, 0, frame, spots, label);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // About 30 frames a second is plenty for a slow movement.
      if (now - last > 32) {
        last = now;
        node.innerHTML = frameMarkup(art, phase(now - start), frame, spots, label);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [art, frame, playing, reduced]);

  if (!art || !frame) return null;

  if (reduced && art.motion) {
    return (
      <div class="stage stage-pair">
        {[0, 1].map((t) => (
          <figure key={t} class="stage-frame">
            <div class="stage-art" dangerouslySetInnerHTML={{ __html: frameMarkup(art, t, frame, t === 0 ? spots : [], `${exercise.name}, ${t === 0 ? 'start' : 'finish'}`) }} />
            <figcaption>{t === 0 ? 'Start' : 'Finish'}</figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div class="stage">
      <div class="stage-art" ref={host} />
      {moves && (
        <button type="button" class="stage-toggle icon-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
      )}
      {!art.motion && <p class="stage-note">Hold this position</p>}
    </div>
  );
}

/** Setup, numbered cues (the numbers match the markers), what to watch for, and the muscles. */
export function FormGuide({ exercise }: { exercise: ExerciseDef }) {
  const spots = cueSpots(exercise.form.cues);
  const main = exercise.primary.map(muscleName);
  const helps = exercise.secondary.filter((m) => !exercise.primary.includes(m)).map(muscleName);
  return (
    <div class="form-guide">
      <section class="form-block">
        <p class="ex-section-title">Setup</p>
        <p>{exercise.form.setup}</p>
      </section>
      <section class="form-block">
        <p class="ex-section-title">Cues</p>
        <ol class="cue-list">
          {exercise.form.cues.map((cue, i) => (
            <li key={cue}>
              <span class={spots[i] ? 'cue-num is-marked num' : 'cue-num num'} aria-hidden="true">
                {i + 1}
              </span>
              <span>{cue}</span>
            </li>
          ))}
        </ol>
      </section>
      <section class="form-block">
        <p class="ex-section-title">Watch for</p>
        <ul class="watch-list">
          {exercise.form.watch.map((item) => (
            <li key={item}>
              <Icon name="alert" size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
      {main.length > 0 && (
        <section class="form-block form-muscles">
          <p class="ex-section-title">Muscles</p>
          <div class="muscles-row">
            <BodyMap primary={exercise.primary} secondary={exercise.secondary} />
            <dl class="form-legend">
              <div>
                <dt>
                  <span class="legend-dot is-main" aria-hidden="true" />
                  Main
                </dt>
                <dd>{sentence(main)}</dd>
              </div>
              {helps.length > 0 && (
                <div>
                  <dt>
                    <span class="legend-dot" aria-hidden="true" />
                    Helping
                  </dt>
                  <dd>{sentence(helps)}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

function sentence(parts: string[]): string {
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]!;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
