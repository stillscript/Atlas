import { useState } from 'preact/hooks';
import { exportBackup } from '../app/backupActions';
import { navigate } from '../app/router';
import { activeGym, activeProgram, appMeta, completedSessions, getDb, patchAppMeta, profile } from '../app/state';
import type { Program, ProgramSlot } from '../db/types';
import { estimateDayMinutes } from '../domain/generator';
import { backupReminderDue, snoozeUntil } from '../domain/reminders';
import { addDays, blockPosition, mondayOf, nextSession, sessionOn, WEEKDAY_LETTER, WEEKDAY_LONG } from '../domain/schedule';
import { formatLongDate } from '../lib/format';
import { haptic } from '../lib/haptics';
import { isMobile, isStandalone } from '../lib/platform';
import { dayMeta } from './plan/meta';
import { Button, IconButton } from '../ui/controls';
import { Notice, showToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Portal } from '../ui/Portal';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Sheet } from '../ui/Sheet';
import { InstallGuide } from './InstallGuide';
import { ExerciseSheet } from './plan/ExerciseSheet';
import { SessionList } from './plan/SessionList';
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

function dayOfYear(date: Date): number {
  return Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function TodayScreen() {
  const program = activeProgram.value;
  const gym = activeGym.value;
  const me = profile.value;
  const app = appMeta.value;
  const [openSlot, setOpenSlot] = useState<ProgramSlot | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  if (!program || !gym) return null;

  const now = new Date();
  const day = sessionOn(program, now);
  const block = blockPosition(program, now);
  const next = nextSession(program, now);
  const firstWeek = completedSessions.value === 0;
  const backupDue = app ? backupReminderDue(app, completedSessions.value) : false;
  const inBrowser = isMobile() && !isStandalone();

  async function backUp() {
    setBackingUp(true);
    try {
      if ((await exportBackup(getDb())) !== 'cancelled') {
        await patchAppMeta({ lastBackupAt: Date.now() });
        showToast('Backup saved', 'good');
      }
    } finally {
      setBackingUp(false);
    }
  }

  const weekLabel = block.lighterWeek ? 'Lighter week' : `Week ${block.week} of ${block.lengthWeeks}`;

  return (
    <main class={day ? 'screen today has-cta' : 'screen today'}>
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

      <WeekStrip program={program} today={now} />

      {day ? (
        <section class="today-card" aria-label="Today’s session">
          <p class="today-card-meta num">{dayMeta(day)}</p>
          <SessionList day={day} gym={gym} profile={me} onOpen={setOpenSlot} />
        </section>
      ) : (
        <section class="today-card today-rest">
          <p class="today-rest-line">{REST_LINES[dayOfYear(now) % REST_LINES.length]}</p>
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
        {firstWeek && day && (
          <Notice icon="coach" tone="accent" title="This week finds your working weights">
            Start with the light weight shown. After each set, tell Atlas how many more reps you could have done, and it
            sets the next weight from that.
          </Notice>
        )}
        {backupDue && (
          <Notice
            icon="share"
            tone="warn"
            title="Time for a backup"
            action={
              <>
                <Button variant="primary" size="sm" disabled={backingUp} onClick={() => void backUp()}>
                  Back up now
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void patchAppMeta({ backupReminderSnoozedUntil: snoozeUntil() })}>
                  Later
                </Button>
              </>
            }
          >
            It’s been a month. A backup file keeps your training safe if anything happens to this phone.
          </Notice>
        )}
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

      {day && (
        <Portal>
          <div class="today-cta">
            <Button
              variant="primary"
              size="lg"
              block
              icon="arrow-right"
              onClick={() => {
                haptic('tap');
                showToast('Workout mode arrives in the next build');
              }}
            >
              Start workout
            </Button>
          </div>
        </Portal>
      )}

      <ExerciseSheet slot={openSlot} gym={gym} onClose={() => setOpenSlot(null)} />
      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="Add Atlas to your Home Screen">
        <InstallGuide variant="sheet" />
      </Sheet>
    </main>
  );
}

function WeekStrip({ program, today }: { program: Program; today: Date }) {
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
        const classes = ['week-day', planned ? 'is-planned' : 'is-rest', isToday ? 'is-today' : '', isPast ? 'is-past' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={i}
            role="listitem"
            class={classes}
            aria-label={`${WEEKDAY_LONG[i]}${isToday ? ' (today)' : ''}: ${planned ? planned.name : 'rest'}`}
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
