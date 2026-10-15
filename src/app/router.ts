import { computed, signal } from '@preact/signals';

/**
 * Hash routes (#/today, #/plan/day/upper-a). Hash routing needs no server rewrites, so the app
 * works on GitHub Pages under any repo name and from the Home Screen.
 */

export const TAB_ROUTES = ['today', 'coach', 'progress', 'plan'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

export type Route =
  | { name: TabRoute }
  | { name: 'settings' }
  | { name: 'plan-day'; dayId: string }
  | { name: 'gym' }
  | { name: 'workout' }
  | { name: 'summary'; sessionId: string };

export type RouteName = Route['name'];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0]!.split('/').filter(Boolean).map(decodeURIComponent);
  const [first, second, third] = parts;
  if (first === 'plan' && second === 'day' && third) return { name: 'plan-day', dayId: third };
  if (first === 'plan' && second === 'gym') return { name: 'gym' };
  if (first === 'settings') return { name: 'settings' };
  if (first === 'workout') return { name: 'workout' };
  if (first === 'summary' && second) return { name: 'summary', sessionId: second };
  if ((TAB_ROUTES as readonly string[]).includes(first ?? '')) return { name: first as TabRoute };
  return { name: 'today' };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case 'plan-day':
      return `/plan/day/${encodeURIComponent(route.dayId)}`;
    case 'gym':
      return '/plan/gym';
    case 'summary':
      return `/summary/${encodeURIComponent(route.sessionId)}`;
    default:
      return `/${route.name}`;
  }
}

export const route = signal<Route>(parseRoute(typeof location === 'undefined' ? '' : location.hash));

/** The tab a route belongs to, for the tab bar highlight (null for full-screen routes). */
export const activeTab = computed<TabRoute | null>(() => {
  const current = route.value;
  if (current.name === 'plan-day' || current.name === 'gym') return 'plan';
  return isTab(current.name) ? current.name : null;
});

/** True once the user has navigated inside the app, so "back" can use history safely. */
let navigatedInApp = false;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = parseRoute(location.hash);
    if (routePath(next) !== routePath(route.value)) {
      route.value = next;
      window.scrollTo({ top: 0 });
    }
  });
}

export function isTab(name: RouteName): name is TabRoute {
  return (TAB_ROUTES as readonly string[]).includes(name);
}

export function navigate(to: Route | TabRoute | 'settings' | 'gym' | 'workout', options: { replace?: boolean } = {}): void {
  const target: Route = typeof to === 'string' ? ({ name: to } as Route) : to;
  if (routePath(target) === routePath(route.value)) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (options.replace) {
    // No history entry: "back" from here skips the screen being replaced (e.g. a finished workout).
    history.replaceState(history.state, '', `#${routePath(target)}`);
    route.value = target;
    window.scrollTo({ top: 0 });
    return;
  }
  navigatedInApp = true;
  location.hash = routePath(target);
}

export function goBack(fallback: Route | TabRoute = 'today'): void {
  if (navigatedInApp && history.length > 1) history.back();
  else navigate(fallback);
}
