import { useEffect, useState } from 'preact/hooks';
import { coachTodayState, pendingStartDay, planFor } from '../app/coach';
import type { PlanOptions } from '../coach/engine';
import { BackupReminder } from './BackupReminder';
import { ShortOnTimeSheet, TodayCoach } from './coach/TodayCoach';
import { navigate } from '../app/router';
import { activeGym, activeProgram, completedSessions, profile, settings } from '../app/state';
import { activeSession, pastSessions, startWorkout } from '../app/workout';
import type { Program, ProgramDay, ProgramSlot } from '../db/types';
import { estimateDayMinutes } from '../domain/generator';
import { addDays, blockPosition, mondayOf, nextSession, sessionOn, WEEKDAY_LETTER, WEEKDAY_LONG } from '../domain/schedule';
import { summarize } from '../domain/workout';
import { primeAudio } from '../lib/chime';
import { formatLongDate, plural, toISODate } from '../lib/format';
import { isMobile, isStandalone } from '../lib/platform';
import { dayMeta } from './plan/meta';
import { Button, IconButton } from '../ui/controls';
import { Notice } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Portal } from '../ui/Portal';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Sheet } from '../ui/Sheet';
import { InstallGuide } from './InstallGuide';
import { ExerciseSheet } from './plan/ExerciseSheet';
import { SessionList } from './plan/SessionList';
import { DayPickerSheet, ReadinessSheet } from './workout/StartSheets';
import './today.css';

/** Rest-day lines; the date picks one, so the message changes from one rest day to the next. */
const REST_LINES = [
  'Recovery is when the training turns into progress.',
  'Muscles grow between sessions, not during them.',
  'A walk, good food and sleep: that’s today’s training.',
  'Rest today keeps the next session strong.',
  'Easy movement is welcome. The heavy work can wait.',
  'Today’s job is recovering, so tomorrow’s sets count.',
];

/** After today's session is done. */
const DONE_LINES = [
  'Session done. Eat well and sleep well: that’s where it turns into progress.',
  'That’s today’s work in the bank. Recovery takes it from here.',
  'Done for today. Protein, water and a good night’s sleep.',
];

function dayOfYear(date: Date): number {
  return Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function TodayScreen() {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  const inProgress = activeSession.value;
  const [openSlot, setOpenSlot] = useState<ProgramSlot | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<{ open: boolean; day: ProgramDay | null; options: PlanOptions }>({ open: false, day: null, options: {} });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);

  /** Start a session: the quick check-in first if it's switched on (never for cardio only). */
  const begin = (chosen: ProgramDay | null, options: PlanOptions = {}) => {
    primeAudio();
    setPickerOpen(false);
    setShortOpen(false);
    if (chosen && settings.value.readinessCheck) setCheckIn({ open: true, day: chosen, options });
    else void startWorkout(chosen, undefined, chosen ? planFor(chosen, options) : null);
  };

  // "Do it today" from the Coach tab lands here.
  useEffect(() => {
    const dayId = pendingStartDay.value;
    if (!dayId || !program) return;
    pendingStartDay.value = null;
    const target = program.days.find((d) => d.id === dayId);
    if (target && !activeSession.value) begin(target);
  }, [pendingStartDay.value]);

  if (!program || !gym) return null;

  const now = new Date();
  const day = sessionOn(program, now);
  const block = blockPosition(program, now);
  const next = nextSession(program, now);
  const firstWeek = completedSessions.value === 0;
  const finishedToday = pastSessions.value.filter((s) => s.date === toISODate(now));
  const plannedDone = day ? finishedToday.some((s) => s.dayId === day.id) : false;
  const showStart = Boolean(day) && !plannedDone && !inProgress;
  const inBrowser = isMobile() && !isStandalone();

  const weekLabel = block.lighterWeek ? 'Lighter week' : `Week ${block.week} of ${block.lengthWeeks}`;

  return (
    <main class={showStart || inProgress ? 'screen today has-cta' : 'screen today'}>
      <ScreenHeader
        eyebrow={formatLongDate(now)}
        title={day ? day.name : 'Rest day'}
        actions={
          <>
            <button type="button" class="gym-chip" onClick={() => navigate('gym')} aria-label={`Gym: ${gym.name}`}>
              <Icon name="building" size={16} />
              {gym.name}
            </button>
            <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />
          </>
        }
      />
      <p class="today-sub">{day?.subtitle ? `${day.subtitle} · ${weekLabel}` : weekLabel}</p>

      <WeekStrip program={program} today={now} doneDates={new Set(pastSessions.value.map((s) => s.date))} />

      {finishedToday.map((session) => {
        const stats = summarize(session);
        return (
          <button
            key={session.id}
            type="button"
            class="today-done"
            onClick={() => navigate({ name: 'summary', sessionId: session.id })}
          >
            <span class="today-done-icon">
              <Icon name="check" size={20} />
            </span>
            <span class="today-done-text">
              <strong>{session.dayName ?? 'Workout'} done</strong>
              <span class="num">
                {stats.workSets ? `${plural(stats.workSets, 'set')} · ` : ''}
                {stats.cardioMinutes ? `${stats.cardioMinutes} min cardio · ` : ''}
                {stats.minutes} min
              </span>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
        );
      })}

      {!inProgress && (
        <TodayCoach
          showSessionChanges={showStart}
          onStartDay={(dayId) => {
            const target = program.days.find((d) => d.id === dayId);
            if (target) begin(target);
          }}
        />
      )}

      {day && !plannedDone ? (
        <section class="today-card" aria-label="Today’s session">
          <p class="today-card-meta num">{dayMeta(day)}</p>
          {/* The Coach's day: in another gym, exercises it can't do already show their stand-ins (I3). */}
          <SessionList day={coachTodayState.value?.plan?.day ?? day} gym={gym} profile={me} onOpen={setOpenSlot} plan={coachTodayState.value?.plan} />
          {!inProgress && (
            <div class="today-links">
              <button type="button" class="today-switch" onClick={() => setPickerOpen(true)}>
                Do a different session
              </button>
              {estimateDayMinutes(day) > 35 && (
                <button type="button" class="today-switch" onClick={() => setShortOpen(true)}>
                  Short on time?
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <section class="today-card today-rest">
          <p class="today-rest-line">
            {plannedDone ? DONE_LINES[dayOfYear(now) % DONE_LINES.length] : REST_LINES[dayOfYear(now) % REST_LINES.length]}
          </p>
          {!inProgress && (
            <div class="today-rest-actions">
              <Button size="sm" icon="dumbbell" onClick={() => setPickerOpen(true)}>
                {plannedDone ? 'Train again' : 'Train anyway'}
              </Button>
              <Button size="sm" variant="ghost" icon="pulse" onClick={() => begin(null)}>
                Cardio
              </Button>
            </div>
          )}
          {next && (
            <button type="button" class="next-up" onClick={() => navigate({ name: 'plan-day', dayId: next.day.id })}>
              <span class="next-up-label">Next</span>
              <span class="next-up-text">
                <strong>{next.day.name}</strong>
                <span>
                  {next.daysAway === 1 ? 'Tomorrow' : WEEKDAY_LONG[(next.date.getDay() + 6) % 7]} · about{' '}
                  {estimateDayMinutes(next.day)} min
                </span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          )}
        </section>
      )}

      <div class="today-notices">
        {firstWeek && showStart && (
          <Notice icon="coach" tone="accent" title="This week finds your working weights">
            Start with the light weight shown. After each set, tell Atlas how many more reps you could have done, and it
            sets the next weight from that.
          </Notice>
        )}
        <BackupReminder />
        {inBrowser && (
          <Notice
            icon="home-add"
            tone="accent"
            title="Add Atlas to your Home Screen"
            action={
              <Button variant="secondary" size="sm" onClick={() => setInstallOpen(true)}>
                Show me how
              </Button>
            }
          >
            It keeps your data protected and works offline.
          </Notice>
        )}
      </div>

      {(showStart || inProgress) && (
        <Portal>
          <div class="today-cta">
            {inProgress ? (
              <Button variant="primary" size="lg" block icon="play" onClick={() => navigate('workout')}>
                Resume {inProgress.dayName ?? 'workout'}
              </Button>
            ) : (
              <Button variant="primary" size="lg" block icon="arrow-right" onClick={() => day && begin(day)}>
                Start workout
              </Button>
            )}
          </div>
        </Portal>
      )}

      <ExerciseSheet slot={openSlot} gym={gym} onClose={() => setOpenSlot(null)} />
      <ReadinessSheet day={checkIn.day} options={checkIn.options} open={checkIn.open} onClose={() => setCheckIn({ ...checkIn, open: false })} />
      <DayPickerSheet program={program} open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(d) => begin(d)} />
      {day && <ShortOnTimeSheet day={day} open={shortOpen} onClose={() => setShortOpen(false)} onPick={(minutes) => begin(day, { minutes })} />}
      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="Add Atlas to your Home Screen">
        <InstallGuide variant="sheet" />
      </Sheet>
    </main>
  );
}

function WeekStrip({ program, today, doneDates }: { program: Program; today: Date; doneDates: Set<string> }) {
  const monday = mondayOf(today);
  const todayKey = today.toDateString();
  // Days before the plan existed weren't missed, so they get no marker.
  const planStart = new Date(program.createdAt);
  planStart.setHours(0, 0, 0, 0);
  return (
    <div class="week-strip" role="list" aria-label="This week">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const planned = date >= planStart ? sessionOn(program, date) : null;
        const isToday = date.toDateString() === todayKey;
        const isPast = date < today && !isToday;
        const done = doneDates.has(toISODate(date));
        const classes = ['week-day', planned ? 'is-planned' : 'is-rest', isToday ? 'is-today' : '', isPast ? 'is-past' : '', done ? 'is-done' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={i}
            role="listitem"
            class={classes}
            aria-label={`${WEEKDAY_LONG[i]}${isToday ? ' (today)' : ''}: ${planned ? planned.name : 'rest'}${done ? ', done' : ''}`}
          >
            <span class="week-letter">{WEEKDAY_LETTER[i]}</span>
            <span class="week-date num">{date.getDate()}</span>
            <span class="week-mark" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
