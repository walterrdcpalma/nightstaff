import { describe, expect, it } from 'vitest';
import { addDays, cycleDay } from './cycle.ts';
import { resolveNight } from './resolveNight.ts';
import { prepareNight, nextStep } from './schedule.ts';
import type { CycleState, StoredAction } from './schedule.ts';

describe('cycleDay e addDays', () => {
  it('contam dias de calendário, também depois do dia 11 e na mudança de hora', () => {
    expect(cycleDay('2026-10-20', '2026-10-31')).toBe(12);
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 11)).toBe('2027-01-11');
  });
});

describe('nextStep', () => {
  const start = '2026-11-02';
  const game = (over: Partial<CycleState>): CycleState => ({
    startDate: start,
    status: 'prep',
    players: 3,
    resolvedNights: 0,
    ...over,
  });

  it('preparação: nada no dia 1', () => {
    expect(nextStep(game({}), start)).toBeNull();
  });

  it('preparação: arranca às 00:00 do dia 2 com 3 ou mais inscritos', () => {
    expect(nextStep(game({ players: 3 }), '2026-11-03')).toEqual({ kind: 'START' });
    expect(nextStep(game({ players: 8 }), '2026-11-03')).toEqual({ kind: 'START' });
  });

  it('preparação: com menos de 3 inscritos, adia o dia 1 para o dia seguinte', () => {
    expect(nextStep(game({ players: 2 }), '2026-11-03')).toEqual({ kind: 'POSTPONE', startDate: '2026-11-03' });
    expect(nextStep(game({ players: 2, startDate: '2026-11-03' }), '2026-11-03')).toBeNull();
  });

  it('a correr: a noite N resolve-se às 00:00 do dia N + 2', () => {
    const running = game({ status: 'running' });
    expect(nextStep(running, '2026-11-03')).toBeNull(); // dia 2: escolhe-se a noite 1
    expect(nextStep(running, '2026-11-04')).toEqual({ kind: 'RESOLVE', night: 1 });
    expect(nextStep(game({ status: 'running', resolvedNights: 1 }), '2026-11-04')).toBeNull();
    expect(nextStep(game({ status: 'running', resolvedNights: 8 }), '2026-11-12')).toEqual({ kind: 'RESOLVE', night: 9 });
  });

  it('a correr: recupera noites em atraso, uma de cada vez', () => {
    expect(nextStep(game({ status: 'running', resolvedNights: 2 }), '2026-11-10')).toEqual({ kind: 'RESOLVE', night: 3 });
  });

  it('a correr: depois da noite 9, acaba', () => {
    expect(nextStep(game({ status: 'running', resolvedNights: 9 }), '2026-11-12')).toEqual({ kind: 'FINISH' });
  });

  it('acabado: no dia 11 nada; no dia 12 cria o ciclo seguinte, que começa nesse dia', () => {
    expect(nextStep(game({ status: 'finished', resolvedNights: 9 }), '2026-11-12')).toBeNull();
    expect(nextStep(game({ status: 'finished', resolvedNights: 9 }), '2026-11-13')).toEqual({
      kind: 'NEXT_CYCLE',
      startDate: '2026-11-13',
    });
  });

  it('um ciclo inteiro, chamado de hora a hora, faz cada passo uma só vez', () => {
    let g = game({ players: 2, startDate: '2026-10-20' });
    let enrolled = 2;
    const steps: string[] = [];
    for (let d = 0; d < 14; d++) {
      const today = addDays('2026-10-20', d);
      for (let hour = 0; hour < 24; hour++) {
        if (today === '2026-10-21' && hour === 9) enrolled = 4; // entra mais gente na preparação adiada
        if (g.status === 'prep') g = { ...g, players: enrolled };
        const s = nextStep(g, today);
        if (!s) continue;
        steps.push(`${today} ${s.kind}${s.kind === 'RESOLVE' ? s.night : ''}`);
        if (s.kind === 'START') g = { ...g, status: 'running' };
        if (s.kind === 'POSTPONE') g = { ...g, startDate: s.startDate };
        if (s.kind === 'RESOLVE') g = { ...g, resolvedNights: s.night };
        if (s.kind === 'FINISH') g = { ...g, status: 'finished' };
        if (s.kind === 'NEXT_CYCLE') g = { startDate: s.startDate, status: 'prep', players: enrolled, resolvedNights: 0 };
      }
    }
    expect(steps).toEqual([
      '2026-10-21 POSTPONE',
      '2026-10-22 START',
      ...Array.from({ length: 9 }, (_, i) => `${addDays('2026-10-23', i)} RESOLVE${i + 1}`),
      '2026-10-31 FINISH',
      '2026-11-01 NEXT_CYCLE',
      '2026-11-02 START',
    ]);
  });
});

describe('prepareNight', () => {
  const players = ['ana', 'bruno', 'carla'];
  const a = (night: number, playerId: string, type: StoredAction['type'], targetId?: string): StoredAction => ({
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

  it('jogador que já não está no ciclo: a ação é inválida', () => {
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
