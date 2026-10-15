import { useEffect, useState } from 'preact/hooks';
import { CoachScreen, PlanScreen, ProgressScreen } from '../screens/EmptyTabs';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { pendingWhatsNew } from '../pwa/whatsNew';
import { UpdateBanner, WhatsNewSheet } from '../pwa/UpdateUI';
import { ToastHost } from '../ui/feedback';
import { isTab, route, type RouteName } from './router';
import { workoutActive } from './state';
import { TabBar } from './TabBar';
import './app.css';

function screenFor(name: RouteName) {
  switch (name) {
    case 'coach':
      return <CoachScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'plan':
      return <PlanScreen />;
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
  const current = route.value;
  return (
    <>
      <div class="screen-host" key={current}>
        {screenFor(current)}
      </div>
      {isTab(current) && <TabBar active={current} />}
      <UpdateBanner />
      <PostUpdateNotes />
      <ToastHost />
    </>
  );
}
