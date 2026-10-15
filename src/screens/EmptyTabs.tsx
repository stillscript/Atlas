import { navigate } from '../app/router';
import { Button, IconButton } from '../ui/controls';
import { EmptyState, showToast } from '../ui/feedback';
import { ScreenHeader } from '../ui/ScreenHeader';

const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

export function CoachScreen() {
  return (
    <main class="screen">
      <ScreenHeader title="Coach" actions={settingsButton} />
      <EmptyState icon="coach" title="Your coach starts with your first workout">
        After each session it reviews every set, then suggests what to change next time and why. Nothing changes
        without your OK.
      </EmptyState>
    </main>
  );
}

export function ProgressScreen() {
  return (
    <main class="screen">
      <ScreenHeader title="Progress" actions={settingsButton} />
      <EmptyState icon="progress" title="Your progress will show up here">
        Strength charts, personal records and body measurements appear after your first workout.
      </EmptyState>
    </main>
  );
}

export function PlanScreen() {
  return (
    <main class="screen">
      <ScreenHeader title="Plan" actions={settingsButton} />
      <EmptyState
        icon="plan"
        title="No plan yet"
        action={
          <Button variant="primary" size="lg" block onClick={() => showToast('Setup arrives in the next build')}>
            Build my plan
          </Button>
        }
      >
        Answer five quick questions and Atlas builds a plan around the equipment in your gym.
      </EmptyState>
    </main>
  );
}
