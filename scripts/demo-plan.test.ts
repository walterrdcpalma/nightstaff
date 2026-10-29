import { describe, expect, it } from 'vitest';
import { NIGHTS, validateAction } from '../engine/index.ts';
import type { PastAction } from '../engine/index.ts';
import { DEMO_PLAYERS, botActions, features, findDemoSeed, isLocalUrl, playNights } from './demo-plan.ts';

const players = DEMO_PLAYERS.map((p) => p.id);

describe('dados de demonstração (T7b)', () => {
  it('só corre no Supabase local', () => {
    expect(isLocalUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalUrl('http://localhost:54321/')).toBe(true);
    expect(isLocalUrl('https://abcd.supabase.co')).toBe(false);
    expect(isLocalUrl('http://127.0.0.1.evil.com')).toBe(false);
    expect(isLocalUrl('http://localhost.example.com:54321')).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });

  it('6 jogadores, com o Walter e os ids do seed.sql', () => {
    expect(DEMO_PLAYERS).toHaveLength(6);
    expect(DEMO_PLAYERS[0]).toEqual({ id: '00000000-0000-0000-0000-000000000001', name: 'Walter', email: 'walter@nightstaff.local' });
    expect(new Set(players).size).toBe(6);
  });

  it('a seed da demo dá, nas noites 1 a 4, sorteio, defesa com revelação, bomba e assalto', () => {
    const seed = findDemoSeed(players);
    expect(features(players, playNights(players, 4, seed))).toEqual({ draw: true, reveal: true, bomb: true, burglary: true });
  });

  it('as 9 noites dos bots são válidas (quotas, alvos e alvo repetido) e as 4 primeiras são as da procura', () => {
    const seed = findDemoSeed(players);
    const nights = playNights(players, NIGHTS, seed);
    expect(nights.slice(0, 4)).toEqual(playNights(players, 4, seed));
    const past: PastAction[] = [];
    nights.forEach((actions, i) => {
      for (const a of actions) expect(validateAction({ players, night: i + 1, pastActions: past }, a)).toEqual({ ok: true });
      past.push(...actions.map((a) => ({ ...a, night: i + 1 })));
    });
  });

  it('o demo:noite preenche só quem ainda não escolheu', () => {
    const actions = botActions(players, players.slice(1), 1, [], [], () => 0.5);
    expect(actions.map((a) => a.playerId)).toEqual(players.slice(1));
  });
});
