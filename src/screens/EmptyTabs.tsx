import { navigate } from '../app/router';
import { IconButton } from '../ui/controls';
import { EmptyState } from '../ui/feedback';
import { ScreenHeader } from '../ui/ScreenHeader';

const settingsButton = <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />;

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
