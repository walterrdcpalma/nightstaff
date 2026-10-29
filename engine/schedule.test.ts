import { describe, expect, it } from 'vitest';
import { addDays } from './cycle.ts';
import { resolveNight } from './resolveNight.ts';
import { prepareNight, nextStep } from './schedule.ts';
import type { GameSchedule } from './schedule.ts';
import type { PastAction } from './types.ts';

describe('nextStep', () => {
  const start = '2026-11-02';
  const game = (resolvedNights: number): GameSchedule => ({ startDate: start, resolvedNights });

  it('no dia de Começar escolhe-se a noite 1: nada a resolver', () => {
    expect(nextStep(game(0), start)).toBeNull();
  });

  it('a noite N resolve-se às 00:00 do dia seguinte', () => {
    expect(nextStep(game(0), '2026-11-03')).toEqual({ kind: 'RESOLVE', night: 1 });
    expect(nextStep(game(1), '2026-11-03')).toBeNull();
    expect(nextStep(game(8), '2026-11-11')).toEqual({ kind: 'RESOLVE', night: 9 });
  });

  it('recupera noites em atraso, uma de cada vez', () => {
    expect(nextStep(game(2), '2026-11-09')).toEqual({ kind: 'RESOLVE', night: 3 });
  });

  it('depois da noite 9, acaba', () => {
    expect(nextStep(game(9), '2026-11-11')).toEqual({ kind: 'FINISH' });
  });

  it('uma partida inteira, chamada de hora a hora, faz cada passo uma só vez e acaba sem criar outra', () => {
    let g = game(0);
    let finished = false;
    const steps: string[] = [];
    for (let d = 0; d < 14; d++) {
      const today = addDays(start, d);
      for (let hour = 0; hour < 24 && !finished; hour++) {
        const s = nextStep(g, today);
        if (!s) continue;
        steps.push(`${today} ${s.kind}${s.kind === 'RESOLVE' ? s.night : ''}`);
        if (s.kind === 'RESOLVE') g = { ...g, resolvedNights: s.night };
        if (s.kind === 'FINISH') finished = true;
      }
    }
    expect(steps).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `${addDays('2026-11-03', i)} RESOLVE${i + 1}`),
      '2026-11-11 FINISH',
    ]);
  });
});

describe('prepareNight', () => {
  const players = ['ana', 'bruno', 'carla'];
  const a = (night: number, playerId: string, type: PastAction['type'], targetId?: string): PastAction => ({
    night,
    playerId,
    type,
    targetId: targetId ?? null,
  });

  it('passa as ações válidas da noite e as anteriores como pastActions', () => {
    const stored = [a(1, 'ana', 'ATTACK', 'bruno'), a(2, 'ana', 'DEFEND'), a(2, 'bruno', 'STAY')];
    const input = prepareNight(players, stored, 2);
    expect(input.state).toEqual({
      players,
      night: 2,
      pastActions: [{ playerId: 'ana', type: 'ATTACK', targetId: 'bruno', night: 1 }],
    });
    expect(input.actions.map((x) => x.playerId)).toEqual(['ana', 'bruno']);
    expect(input.invalid).toEqual([]);
  });

  it('ação inválida: fica como STAY e é registada, sem bloquear a noite', () => {
    const stored = [a(1, 'ana', 'ATTACK', 'dina'), a(1, 'bruno', 'ATTACK', 'carla')];
    const input = prepareNight(players, stored, 1);
    expect(input.invalid).toEqual([
      { night: 1, action: { playerId: 'ana', type: 'ATTACK', targetId: 'dina' }, error: 'UNKNOWN_TARGET' },
    ]);
    const { ledger } = resolveNight(input.state, input.actions, 1);
    expect(ledger).toContainEqual({ playerId: 'ana', delta: 2, reason: 'HOME_BONUS' });
    expect(ledger).toContainEqual({ playerId: 'bruno', delta: 10, reason: 'ATTACK_SUCCESS', targetId: 'carla' });
  });

  it('jogador que já não está na partida: a ação é inválida', () => {
    expect(prepareNight(players, [a(1, 'dina', 'STAY')], 1).invalid[0].error).toBe('UNKNOWN_PLAYER');
  });

  it('quota além do limite: a 4.ª Visita é inválida; as quotas contam só ações válidas', () => {
    const stored = [
      a(1, 'ana', 'ATTACK', 'dina'), // inválida: não gasta quota
      a(2, 'ana', 'ATTACK', 'bruno'),
      a(3, 'ana', 'ATTACK', 'carla'),
      a(4, 'ana', 'ATTACK', 'bruno'),
      a(5, 'ana', 'ATTACK', 'carla'),
    ];
    expect(prepareNight(players, stored, 4).invalid).toEqual([]);
    expect(prepareNight(players, stored, 5).invalid.map((x) => x.error)).toEqual(['QUOTA_EXHAUSTED']);
  });

  it('alvo repetido em noites seguidas: a ação é inválida (STAY), e a seguinte volta a poder atacá-lo', () => {
    const stored = [a(1, 'ana', 'ATTACK', 'bruno'), a(2, 'ana', 'ATTACK', 'bruno'), a(3, 'ana', 'ATTACK', 'bruno')];
    expect(prepareNight(players, stored, 2).invalid.map((x) => x.error)).toEqual(['SAME_TARGET']);
    // A da noite 2 ficou STAY, por isso na noite 3 a Ana pode voltar ao Bruno.
    expect(prepareNight(players, stored, 3).invalid).toEqual([]);
  });

  it('ação duplicada: fica a primeira', () => {
    const input = prepareNight(players, [a(1, 'ana', 'DEFEND'), a(1, 'ana', 'STAY')], 1);
    expect(input.actions).toEqual([{ playerId: 'ana', type: 'DEFEND', targetId: null }]);
    expect(input.invalid.map((x) => x.error)).toEqual(['DUPLICATE']);
  });

  it('noite fora de 1 a 9 lança erro', () => {
    expect(() => prepareNight(players, [], 0)).toThrow(RangeError);
    expect(() => prepareNight(players, [], 10)).toThrow(RangeError);
  });
});
