import { signal } from '@preact/signals';

/**
 * Hash routes (#/today, #/settings). Hash routing needs no server rewrites, so the app works on
 * GitHub Pages under any repo name and from the Home Screen.
 */

export const TAB_ROUTES = ['today', 'coach', 'progress', 'plan'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];
export type RouteName = TabRoute | 'settings';

const KNOWN: readonly RouteName[] = [...TAB_ROUTES, 'settings'];

function parse(hash: string): RouteName {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (KNOWN as readonly string[]).includes(name) ? (name as RouteName) : 'today';
}

export const route = signal<RouteName>(parse(typeof location === 'undefined' ? '' : location.hash));

/** True once the user has navigated inside the app, so "back" can use history safely. */
let navigatedInApp = false;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = parse(location.hash);
    if (next !== route.value) {
      route.value = next;
      window.scrollTo({ top: 0 });
    }
  });
}

export function isTab(name: RouteName): name is TabRoute {
  return (TAB_ROUTES as readonly string[]).includes(name);
}

export function navigate(to: RouteName): void {
  if (route.value === to) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  navigatedInApp = true;
  location.hash = `/${to}`;
}

export function goBack(fallback: RouteName = 'today'): void {
  if (navigatedInApp && history.length > 1) history.back();
  else navigate(fallback);
}
