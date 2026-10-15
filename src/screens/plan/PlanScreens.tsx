import { useState } from 'preact/hooks';
import { goBack, navigate } from '../../app/router';
import { activeGym, activeProgram, profile } from '../../app/state';
import type { EquipmentCategory, Goal, ProgramSlot } from '../../db/types';
import { templateById } from '../../domain/catalog';
import { estimateDayMinutes, goalName } from '../../domain/generator';
import { availableLoads, summarizeLoad } from '../../domain/loads';
import { blockPosition, programDay, WEEKDAY_LONG } from '../../domain/schedule';
import { plural } from '../../lib/format';
import { IconButton } from '../../ui/controls';
import { EmptyState } from '../../ui/feedback';
import { ListGroup, ListRow } from '../../ui/List';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { dayMeta } from './meta';
import { ExerciseSheet } from './ExerciseSheet';
import { SessionList } from './SessionList';
import './plan.css';

const EXPERIENCE_NAMES = { beginner: 'New to lifting', intermediate: 'Some experience', advanced: 'Experienced' } as const;

const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

export function PlanScreen() {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  if (!program || !gym) {
    return (
      <main class="screen">
        <ScreenHeader title="Plan" actions={settingsButton} />
        <EmptyState icon="plan" title="No plan yet">
          Answer a few quick questions and Atlas builds a plan around the equipment in your gym.
        </EmptyState>
      </main>
    );
  }

  const block = blockPosition(program, new Date());
  const template = program.templateId ? templateById(program.templateId) : undefined;
  const trainingDays = program.schedule.filter(Boolean).length;
  const description = template
    ? template.description
    : `Built from your answers for ${gym.name}: ${trainingDays} days a week, every exercise picked from the equipment there.`;

  return (
    <main class="screen">
      <ScreenHeader title="Plan" actions={settingsButton} />

      <section class="plan-card">
        <h2 class="plan-name">{template ? template.name : program.name}</h2>
        <div class="plan-tags">
          <span class="tag is-accent">{goalName(program.goal as Goal)}</span>
          {me && <span class="tag">{EXPERIENCE_NAMES[me.experience]}</span>}
          <span class="tag">{plural(trainingDays, 'day')} a week</span>
        </div>
        <p class="plan-desc">{description}</p>
        <p class="plan-desc">
          {block.lighterWeek
            ? `This is the lighter week. A new ${block.lengthWeeks}-week block starts next week.`
            : `Week ${block.week} of ${block.lengthWeeks}, then a lighter week to recover before the next block.`}
        </p>
      </section>

      <ListGroup title="Your week">
        {program.schedule.map((dayId, weekday) => {
          const day = programDay(program, dayId);
          if (!day) {
            return (
              <div key={weekday} class="row row-rest">
                <span class="row-text">
                  <span class="row-label">{WEEKDAY_LONG[weekday]}</span>
                </span>
                <span class="row-value">Rest</span>
              </div>
            );
          }
          return (
            <ListRow
              key={weekday}
              label={WEEKDAY_LONG[weekday]}
              detail={`${day.name} · ${plural(day.slots.length, 'exercise')} · about ${estimateDayMinutes(day)} min`}
              chevron
              onClick={() => navigate({ name: 'plan-day', dayId: day.id })}
            />
          );
        })}
      </ListGroup>

      <ListGroup title="Gym" footer="To change your goal, days or gym, use Settings › Redo setup. Your history stays.">
        <ListRow
          icon="building"
          tone="accent"
          label={gym.name}
          detail={`${plural(gym.equipment.length, 'piece')} of equipment`}
          chevron
          onClick={() => navigate('gym')}
        />
      </ListGroup>
    </main>
  );
}

export function PlanDayScreen({ dayId }: { dayId: string }) {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const [openSlot, setOpenSlot] = useState<ProgramSlot | null>(null);
  const day = program ? programDay(program, dayId) : null;
  if (!program || !gym || !day) {
    return (
      <main class="screen">
        <ScreenHeader title="Session" onBack={() => goBack('plan')} backLabel="Plan" />
        <EmptyState icon="plan" title="This session isn’t in your plan">
          It may have changed when the plan was rebuilt.
        </EmptyState>
      </main>
    );
  }
  const weekdays = program.schedule.flatMap((id, weekday) => (id === day.id ? [WEEKDAY_LONG[weekday]] : []));
  return (
    <main class="screen">
      <ScreenHeader title={day.name} onBack={() => goBack('plan')} backLabel="Plan" />
      <p class="day-meta">{[day.subtitle, weekdays.join(' and ')].filter(Boolean).join(' · ')}</p>
      <p class="day-meta day-meta-sub">{dayMeta(day)}</p>
      <section class="day-card">
        <SessionList day={day} gym={gym} profile={profile.value} onOpen={setOpenSlot} showPurpose />
      </section>
      <ExerciseSheet slot={openSlot} gym={gym} onClose={() => setOpenSlot(null)} />
    </main>
  );
}

const CATEGORY_ORDER: { category: EquipmentCategory; title: string }[] = [
  { category: 'machine', title: 'Machines' },
  { category: 'cable', title: 'Cables' },
  { category: 'free-weight', title: 'Free weights' },
  { category: 'support', title: 'Benches and racks' },
  { category: 'bodyweight', title: 'Bodyweight' },
  { category: 'other', title: 'Other' },
  { category: 'cardio', title: 'Cardio' },
];

export function GymScreen() {
  const gym = activeGym.value;
  if (!gym) {
    return (
      <main class="screen">
        <ScreenHeader title="Gym" onBack={() => goBack('plan')} backLabel="Plan" />
      </main>
    );
  }
  const needsCheck = gym.equipment.filter((item) => item.verifyLoad).length;
  return (
    <main class="screen">
      <ScreenHeader title={gym.name} onBack={() => goBack('plan')} backLabel="Plan" />
      {CATEGORY_ORDER.map(({ category, title }) => {
        const items = gym.equipment.filter((item) => item.category === category);
        if (!items.length) return null;
        return (
          <ListGroup
            key={category}
            title={title}
            footer={
              category === 'machine' && needsCheck > 0
                ? 'Weight steps marked “check on first use” come from the manufacturer’s specs. Atlas asks you to confirm them the first time you use each one.'
                : undefined
            }
          >
            {items.map((item) => {
              const summary = item.load.kind === 'none' ? (item.cardioMetrics?.length ? 'Time, distance, calories and more' : '') : summarizeLoad(item.load);
              const options = availableLoads(item.load).length;
              return (
                <ListRow
                  key={item.id}
                  label={item.name}
                  detail={
                    <>
                      <span class="gym-load">{summary}</span>
                      {item.verifyLoad && options > 1 ? ' · check on first use' : ''}
                    </>
                  }
                />
              );
            })}
          </ListGroup>
        );
      })}
    </main>
  );
}
