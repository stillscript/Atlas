import { navigate } from '../app/router';
import { APP_VERSION } from '../app/state';
import { formatLongDate } from '../lib/format';
import { Button, IconButton } from '../ui/controls';
import { Notice, showToast } from '../ui/feedback';
import { Logo } from '../ui/Logo';
import { ScreenHeader } from '../ui/ScreenHeader';

export function TodayScreen() {
  return (
    <main class="screen">
      <ScreenHeader
        eyebrow={formatLongDate()}
        title="Today"
        actions={<IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />}
      />

      <section class="welcome">
        <Logo size={52} />
        <h2 class="welcome-title">Train with a coach that learns from every set</h2>
        <p class="welcome-body">
          Atlas builds a plan around the equipment in your gym, guides each workout one exercise at a time, and adjusts
          as you go.
        </p>
        <Button variant="primary" size="lg" block onClick={() => showToast('Setup arrives in the next build')}>
          Set up Atlas
        </Button>
      </section>

      <div class="welcome-points">
        <Notice icon="shield" tone="good" title="Your data stays on this phone">
          No account, no cloud. Back it up to Files whenever you like.
        </Notice>
        <Notice icon="phone" tone="accent" title="Works without signal">
          Once installed, Atlas runs fully offline, so basement gyms are fine.
        </Notice>
      </div>

      <p class="build-note">Preview build {APP_VERSION}</p>
    </main>
  );
}
