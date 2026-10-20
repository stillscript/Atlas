import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../src/domain/catalog';
import { MAPPED_MUSCLES } from '../../src/ui/BodyMap';

describe('body map', () => {
  it('has a place for every muscle the exercises name', () => {
    for (const e of EXERCISES) for (const m of [...e.primary, ...e.secondary]) expect(MAPPED_MUSCLES.has(m), `${e.id}: ${m}`).toBe(true);
  });
});
