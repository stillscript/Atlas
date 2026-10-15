import type { CoachLogEntry } from '../db/types';
import phrasesJson from '../data/coach/phrases.json';
import { ruleInfo } from './knowledge';
import { chooseVariant, isRepeat } from './memory';
import type { Recommendation, Win } from './types';

/**
 * Wording, kept apart from the rules (proposal section 2): a recommendation's structured facts in,
 * plain sentences out. Another renderer (an AI layer, say) could replace `renderRecommendation`
 * and keep everything else.
 */

interface MessageParts {
  title: string[];
  body: string[];
  action?: string[];
}

interface Phrases {
  confidence: Record<string, string>;
  basis: string;
  basisWeeks: string;
  fragments: Record<string, string>;
  messages: Record<string, MessageParts>;
  again: Record<string, string[]>;
  wins: Record<string, { title: string[]; body: string[] }>;
  rest: { advice: string };
}

export const PHRASES = phrasesJson as unknown as Phrases;

export interface RenderContext {
  units: string;
  now: number;
  experience?: string;
  log?: CoachLogEntry[];
}

export interface RenderedMessage {
  title: string;
  body: string;
  /** "Fairly sure · 4 sessions" */
  meta: string;
  /** Logged with "shown", so the same phrasing isn't reused soon. */
  variant: string;
  why: ReturnType<typeof ruleInfo>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Monday" within the last week, else "Oct 6". */
export function dayName(iso: string, now: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const days = Math.round((new Date(new Date(now).toDateString()).getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 7) return WEEKDAYS[date.getDay()]!;
  return `${MONTHS[m - 1]} ${d}`;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : (Math.round(value * 10) / 10).toString();
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Fills {fact}, {fact|one|many} and {fact:clock}. Unknown facts become empty (tests guard against it). */
export function fill(template: string, facts: Record<string, string | number>): string {
  return template
    .replace(/\{(\w+)(?::(\w+))?(?:\|([^|}]*)\|([^}]*))?\}/g, (_, key: string, modifier?: string, one?: string, many?: string) => {
      const value = facts[key];
      if (value === undefined || value === '') return '';
      if (modifier === 'clock' && typeof value === 'number') return clock(value);
      const text = typeof value === 'number' ? formatNumber(value) : value;
      if (one !== undefined && many !== undefined) return `${text} ${Number(value) === 1 ? one : many}`;
      return text;
    })
    .replace(/\s+([.,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Facts every message can use, derived from the raw ones. */
function enrich(facts: Record<string, string | number>, ctx: RenderContext): Record<string, string | number> {
  const out: Record<string, string | number> = { ...facts, unit: ctx.units };
  if (typeof facts.lastDate === 'string') out.lastDay = dayName(facts.lastDate, ctx.now);
  if (typeof facts.since === 'string' && facts.since) out.since = dayName(facts.since, ctx.now);
  // Fatigue signals as one readable list.
  const parts: string[] = [];
  if (Number(facts.creepCount) > 0) parts.push(fill(PHRASES.fragments.creep!, facts));
  if (Number(facts.dipCount) > 0) parts.push(fill(PHRASES.fragments.dip!, facts));
  if (Number(facts.readinessLow) > 0) parts.push(PHRASES.fragments.readinessLow!);
  if (Number(facts.checkoutLow) > 0) parts.push(PHRASES.fragments.checkoutLow!);
  if (Number(facts.painCount) > 0) parts.push(fill(PHRASES.fragments.pain!, facts));
  if (parts.length) {
    const text = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    out.signalsText = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return out;
}

/** Which phrase set a recommendation uses. Beginners get the one-number versions (A6). */
export function messageKey(rec: Pick<Recommendation, 'rule' | 'variant'>, experience?: string): string {
  if (rec.variant.startsWith('held-')) return `held.${rec.variant.slice(5)}`;
  const key = `${rec.rule}.${rec.variant}`;
  if (experience === 'beginner' && PHRASES.messages[`${key}.beginner`]) return `${key}.beginner`;
  return key;
}

export function renderRecommendation(rec: Recommendation, ctx: RenderContext): RenderedMessage {
  const key = messageKey(rec, ctx.experience);
  const parts = PHRASES.messages[key] ?? { title: [`${rec.rule}`], body: [''], action: [''] };
  const actions = parts.action?.length ? parts.action : [''];
  const log = ctx.log ?? [];
  const [t, b, a] = chooseVariant(key, rec.id, [parts.title.length, parts.body.length, actions.length], log);
  const facts = enrich(rec.facts, ctx);
  const again = isRepeat(rec, log) ? PHRASES.again[key]?.[0] : undefined;
  const title = capitalize(fill(`${again ?? ''}${parts.title[t!]!}`, facts));
  const body = [fill(parts.body[b!]!, facts), fill(actions[a!]!, facts)].filter(Boolean).map(capitalize).join(' ');
  const confidence = PHRASES.confidence[rec.confidence] ?? '';
  const basis = fill(rec.basisUnit === 'weeks' ? PHRASES.basisWeeks : PHRASES.basis, { basis: rec.basis });
  const meta = rec.safety ? '' : `${confidence} · ${basis}`;
  return { title, body, meta, variant: `${key}#${t}.${b}.${a}`, why: ruleInfo(rec.rule) };
}

export function renderWin(win: Win, ctx: RenderContext): { title: string; body: string } {
  const parts = PHRASES.wins[win.kind];
  if (!parts) return { title: '', body: '' };
  // Wins rotate by their own id: a seeded pick, stable for the same win.
  let seed = 0;
  for (let i = 0; i < win.id.length; i++) seed = (seed * 31 + win.id.charCodeAt(i)) >>> 0;
  const facts = enrich(win.facts, ctx);
  const body = fill(parts.body[seed % parts.body.length]!, facts);
  return { title: fill(parts.title[seed % parts.title.length]!, facts), body: body === fill(parts.title[0]!, facts) ? '' : body };
}

export function renderRestAdvice(advice: { seconds: number; dropped: number; restTaken: number }): string {
  return fill(PHRASES.rest.advice, advice);
}
