import { describe, expect, it } from 'vitest';
import type { Action, GameState } from './types.ts';
import { remainingQuota, validateAction } from './validateAction.ts';

const PLAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const withPast = (pastActions: Action[]): GameState => ({ players: PLAYERS, night: 1, pastActions });
const fresh = withPast([]);

const repeat = (n: number, a: Action) => Array.from({ length: n }, () => a);

describe('validateAction: alvo', () => {
  it('aceita as 4 ações válidas', () => {
    expect(validateAction(fresh, { playerId: 'A', type: 'STAY' })).toEqual({ ok: true });
    expect(validateAction(fresh, { playerId: 'A', type: 'DEFEND' })).toEqual({ ok: true });
    expect(validateAction(fresh, { playerId: 'A', type: 'ATTACK', targetId: 'B' })).toEqual({ ok: true });
    expect(validateAction(fresh, { playerId: 'A', type: 'BOMB', targetId: 'B' })).toEqual({ ok: true });
  });

  it('não se pode escolher a si próprio como alvo', () => {
    expect(validateAction(fresh, { playerId: 'A', type: 'ATTACK', targetId: 'A' })).toEqual({ ok: false, error: 'SELF_TARGET' });
    expect(validateAction(fresh, { playerId: 'A', type: 'BOMB', targetId: 'A' })).toEqual({ ok: false, error: 'SELF_TARGET' });
  });

  it('ATTACK e BOMB precisam de alvo', () => {
    expect(validateAction(fresh, { playerId: 'A', type: 'ATTACK' })).toEqual({ ok: false, error: 'TARGET_REQUIRED' });
    expect(validateAction(fresh, { playerId: 'A', type: 'BOMB', targetId: null })).toEqual({ ok: false, error: 'TARGET_REQUIRED' });
  });

  it('STAY e DEFEND não podem ter alvo', () => {
    expect(validateAction(fresh, { playerId: 'A', type: 'STAY', targetId: 'B' })).toEqual({ ok: false, error: 'UNEXPECTED_TARGET' });
    expect(validateAction(fresh, { playerId: 'A', type: 'DEFEND', targetId: 'B' })).toEqual({ ok: false, error: 'UNEXPECTED_TARGET' });
    expect(validateAction(fresh, { playerId: 'A', type: 'STAY', targetId: null })).toEqual({ ok: true });
  });

  it('alvo e jogador têm de existir', () => {
    expect(validateAction(fresh, { playerId: 'A', type: 'ATTACK', targetId: 'Z' })).toEqual({ ok: false, error: 'UNKNOWN_TARGET' });
    expect(validateAction(fresh, { playerId: 'Z', type: 'STAY' })).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' });
  });

  it('tipo desconhecido é rejeitado', () => {
    const bad = { playerId: 'A', type: 'FLEE' } as unknown as Action;
    expect(validateAction(fresh, bad)).toEqual({ ok: false, error: 'UNKNOWN_TYPE' });
  });
});

describe('validateAction: quotas', () => {
  it('DEFEND: 2 por jogo', () => {
    const def: Action = { playerId: 'A', type: 'DEFEND' };
    expect(validateAction(withPast([def]), def)).toEqual({ ok: true });
    expect(validateAction(withPast([def, def]), def)).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
  });

  it('ATTACK: 3 por jogo, contando ataques a alvos diferentes', () => {
    const atk = (t: string): Action => ({ playerId: 'A', type: 'ATTACK', targetId: t });
    expect(validateAction(withPast([atk('B'), atk('C')]), atk('D'))).toEqual({ ok: true });
    expect(validateAction(withPast([atk('B'), atk('C'), atk('D')]), atk('E'))).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
  });

  it('BOMB: 1 por jogo', () => {
    const b: Action = { playerId: 'A', type: 'BOMB', targetId: 'B' };
    expect(validateAction(withPast([b]), b)).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
  });

  it('STAY nunca se esgota', () => {
    const s: Action = { playerId: 'A', type: 'STAY' };
    expect(validateAction(withPast(repeat(9, s)), s)).toEqual({ ok: true });
  });

  it('as ações de outros jogadores não gastam a minha quota', () => {
    const b: Action = { playerId: 'B', type: 'BOMB', targetId: 'C' };
    expect(validateAction(withPast([b]), { playerId: 'A', type: 'BOMB', targetId: 'C' })).toEqual({ ok: true });
  });

  it('esgotar uma ação não bloqueia as outras', () => {
    const b: Action = { playerId: 'A', type: 'BOMB', targetId: 'B' };
    expect(validateAction(withPast([b]), { playerId: 'A', type: 'ATTACK', targetId: 'B' })).toEqual({ ok: true });
  });
});

describe('remainingQuota', () => {
  it('começa com as quotas do RULES.md', () => {
    expect(remainingQuota(fresh, 'A')).toEqual({ DEFEND: 2, ATTACK: 3, BOMB: 1 });
  });

  it('sobrevive a JSON sem perder valores (STAY não tem quota)', () => {
    const q = remainingQuota(withPast([{ playerId: 'A', type: 'STAY' }]), 'A');
    expect(JSON.parse(JSON.stringify(q))).toEqual(q);
  });

  it('desconta cada ação passada, independentemente do resultado', () => {
    const past: Action[] = [
      { playerId: 'A', type: 'ATTACK', targetId: 'B' },
      { playerId: 'A', type: 'DEFEND' },
      { playerId: 'A', type: 'ATTACK', targetId: 'C' },
      { playerId: 'B', type: 'ATTACK', targetId: 'A' },
    ];
    expect(remainingQuota(withPast(past), 'A')).toEqual({ DEFEND: 1, ATTACK: 1, BOMB: 1 });
  });
});
