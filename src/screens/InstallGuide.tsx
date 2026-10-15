import { useState } from 'preact/hooks';
import { installPrompt } from '../app/state';
import { haptic } from '../lib/haptics';
import { isAndroid } from '../lib/platform';
import { Button } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import './install.css';

interface Step {
  icon: IconName;
  title: string;
  detail?: string;
}

const IOS_STEPS: Step[] = [
  { icon: 'more', title: 'Tap ••• next to the address bar, then Share', detail: 'On older iPhones, tap the Share button at the bottom of the screen.' },
  { icon: 'home-add', title: 'Scroll down and tap Add to Home Screen', detail: 'If you don’t see it, tap More at the end of the list.' },
  { icon: 'toggle-on', title: 'Keep “Open as Web App” on, then tap Add' },
  { icon: 'phone', title: 'Open Atlas from your Home Screen', detail: 'Set up and train there from now on.' },
];

const ANDROID_STEPS: Step[] = [
  { icon: 'more', title: 'Open your browser menu (⋮)' },
  { icon: 'home-add', title: 'Tap Install app or Add to Home screen' },
  { icon: 'phone', title: 'Open Atlas from your Home Screen' },
];

interface InstallGuideProps {
  /** Full-screen first-run version (with "Continue in Safari"), or the compact Settings version. */
  variant: 'first-run' | 'sheet';
  onContinueInBrowser?: () => void;
}

/**
 * Why and how to add Atlas to the Home Screen. On iPhone, a Home Screen web app keeps its own
 * storage, separate from Safari, and iOS protects it; that's the real reason this comes first.
 */
export function InstallGuide({ variant, onContinueInBrowser }: InstallGuideProps) {
  const [added, setAdded] = useState(false);
  const android = isAndroid();
  const prompt = installPrompt.value;
  const steps = android ? ANDROID_STEPS : IOS_STEPS;

  async function installNow() {
    if (!prompt) return;
    haptic('tap');
    await prompt.prompt();
    const choice = await prompt.userChoice;
    installPrompt.value = null;
    if (choice.outcome === 'accepted') setAdded(true);
  }

  if (added) {
    return (
      <div class={`install install-${variant}`}>
        <div class="install-hero">
          <span class="install-appicon" aria-hidden="true">
            <Logo size={52} />
          </span>
          <h1 class="install-title">Now open Atlas from your Home Screen</h1>
          <p class="install-body">
            Look for the Atlas icon and tap it. Your setup starts there, in the full-screen app. You can close this tab.
          </p>
        </div>
        {variant === 'first-run' && (
          <div class="install-actions">
            <Button variant="ghost" block onClick={() => setAdded(false)}>
              Show the steps again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div class={`install install-${variant}`}>
      <div class="install-hero">
        {variant === 'first-run' && (
          <>
            <span class="install-appicon" aria-hidden="true">
              <Logo size={52} />
            </span>
            <h1 class="install-title">Add Atlas to your Home Screen</h1>
          </>
        )}
        <p class="install-body">
          It opens full screen like any other app, works without signal in the gym, and keeps your training data
          safe. {android ? 'Your phone protects installed apps’ data.' : 'Safari can clear data from websites you haven’t opened in a while; Home Screen apps are protected.'}
        </p>
      </div>

      {prompt ? (
        <div class="install-actions">
          <Button variant="primary" size="lg" block icon="home-add" onClick={() => void installNow()}>
            Install Atlas
          </Button>
        </div>
      ) : (
        <ol class="install-steps">
          {steps.map((step, index) => (
            <li key={step.title} class="install-step">
              <span class="install-step-num" aria-hidden="true">
                {index + 1}
              </span>
              <span class="install-step-text">
                <span class="install-step-title">{step.title}</span>
                {step.detail && <span class="install-step-detail">{step.detail}</span>}
              </span>
              <span class="install-step-icon" aria-hidden="true">
                <Icon name={step.icon} size={20} />
              </span>
            </li>
          ))}
        </ol>
      )}

      <p class="install-note">
        <Icon name="info" size={16} />
        <span>
          {android
            ? 'Anything you set up in this browser tab stays in the browser, so it’s best to install first.'
            : 'Anything you set up in Safari stays in Safari, so it’s best to add Atlas first.'}
        </span>
      </p>

      {variant === 'first-run' && (
        <div class="install-actions">
          {!prompt && (
            <Button variant="primary" size="lg" block onClick={() => setAdded(true)}>
              I’ve added it
            </Button>
          )}
          <Button variant="ghost" block onClick={onContinueInBrowser}>
            {android ? 'Continue in the browser' : 'Continue in Safari'}
          </Button>
        </div>
      )}
    </div>
  );
}
