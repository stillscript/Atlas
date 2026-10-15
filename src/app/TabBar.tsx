import { haptic } from '../lib/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { navigate, type TabRoute } from './router';

const TABS: { route: TabRoute; label: string; icon: IconName }[] = [
  { route: 'today', label: 'Today', icon: 'today' },
  { route: 'coach', label: 'Coach', icon: 'coach' },
  { route: 'progress', label: 'Progress', icon: 'progress' },
  { route: 'plan', label: 'Plan', icon: 'plan' },
];

export function TabBar({ active }: { active: TabRoute }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.route}
          type="button"
          class={tab.route === active ? 'tab is-active' : 'tab'}
          aria-current={tab.route === active ? 'page' : undefined}
          onClick={() => {
            haptic('tap');
            navigate(tab.route);
          }}
        >
          <Icon name={tab.icon} size={25} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
