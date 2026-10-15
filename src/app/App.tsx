import { useEffect, useState } from 'preact/hooks';
import { CoachScreen, ProgressScreen } from '../screens/EmptyTabs';
import { InstallGuide } from '../screens/InstallGuide';
import { Onboarding } from '../screens/onboarding/Onboarding';
import { GymScreen, PlanDayScreen, PlanScreen } from '../screens/plan/PlanScreens';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { pendingWhatsNew } from '../pwa/whatsNew';
import { UpdateBanner, WhatsNewSheet } from '../pwa/UpdateUI';
import { ToastHost } from '../ui/feedback';
import { activeTab, route, routePath, type Route } from './router';
import { needsSetup, patchAppMeta, showInstallGuide, workoutActive } from './state';
import { TabBar } from './TabBar';
import './app.css';

function screenFor(current: Route) {
  switch (current.name) {
    case 'coach':
      return <CoachScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'plan':
      return <PlanScreen />;
    case 'plan-day':
      return <PlanDayScreen dayId={current.dayId} />;
    case 'gym':
      return <GymScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'today':
    default:
      return <TodayScreen />;
  }
}

/** Shows the post-update notes once, a moment after launch, and never during a workout. */
function PostUpdateNotes() {
  const [open, setOpen] = useState(false);
  const content = pendingWhatsNew.value;
  const blocked = workoutActive.value;
  useEffect(() => {
    if (!content || blocked) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [content, blocked]);
  if (!content) return null;
  return (
    <WhatsNewSheet
      content={content}
      open={open}
      onClose={() => {
        setOpen(false);
        window.setTimeout(() => (pendingWhatsNew.value = null), 400);
      }}
    />
  );
}

export function App() {
  // First run on a phone browser: the Home Screen guide comes before anything else.
  if (showInstallGuide.value) {
    return (
      <>
        <InstallGuide variant="first-run" onContinueInBrowser={() => void patchAppMeta({ installGuideDismissedAt: Date.now() })} />
        <ToastHost />
      </>
    );
  }
  if (needsSetup.value) {
    return (
      <>
        <Onboarding />
        <UpdateBanner />
        <ToastHost />
      </>
    );
  }
  const current = route.value;
  const tab = activeTab.value;
  return (
    <>
      <div class="screen-host" key={routePath(current)}>
        {screenFor(current)}
      </div>
      {tab && <TabBar active={tab} />}
      <UpdateBanner />
      <PostUpdateNotes />
      <ToastHost />
    </>
  );
}
