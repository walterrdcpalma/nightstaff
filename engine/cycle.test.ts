import { describe, expect, it } from 'vitest';
import { CYCLE_DAYS, cyclePhase, lisbonDate } from './cycle.ts';

describe('cyclePhase', () => {
  const start = '2026-11-02';

  it('dia 1 é a preparação', () => {
    expect(cyclePhase(start, '2026-11-02')).toEqual({ phase: 'PREP', day: 1 });
  });

  it('dias 2 a 10 são as noites 1 a 9 (limites da fase)', () => {
    expect(cyclePhase(start, '2026-11-03')).toEqual({ phase: 'NIGHT', day: 2, night: 1 });
    expect(cyclePhase(start, '2026-11-11')).toEqual({ phase: 'NIGHT', day: 10, night: 9 });
  });

  it('todas as noites seguem-se sem saltos', () => {
    const nights = Array.from({ length: 9 }, (_, i) => cyclePhase('2026-01-01', `2026-01-${String(i + 2).padStart(2, '0')}`));
    expect(nights.map((p) => (p.phase === 'NIGHT' ? p.night : null))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('dia 11 é a resolução', () => {
    expect(cyclePhase(start, '2026-11-12')).toEqual({ phase: 'RESULTS', day: CYCLE_DAYS });
  });

  it('fora do ciclo lança erro (antes do dia 1 e depois do dia 11)', () => {
    expect(() => cyclePhase(start, '2026-11-01')).toThrow(RangeError);
    expect(() => cyclePhase(start, '2026-11-13')).toThrow(RangeError);
  });

  it('atravessa meses e anos', () => {
    expect(cyclePhase('2026-12-28', '2027-01-07')).toEqual({ phase: 'RESULTS', day: 11 });
    expect(cyclePhase('2028-02-25', '2028-03-01')).toEqual({ phase: 'NIGHT', day: 6, night: 5 }); // 2028 é bissexto
  });

  it('mudança de hora no fim de março (2026-03-29) não estraga a contagem', () => {
    expect(cyclePhase('2026-03-25', '2026-03-29')).toEqual({ phase: 'NIGHT', day: 5, night: 4 });
    expect(cyclePhase('2026-03-25', '2026-04-04')).toEqual({ phase: 'RESULTS', day: 11 });
  });

  it('mudança de hora no fim de outubro (2026-10-25) não estraga a contagem', () => {
    expect(cyclePhase('2026-10-20', '2026-10-25')).toEqual({ phase: 'NIGHT', day: 6, night: 5 });
    expect(cyclePhase('2026-10-20', '2026-10-30')).toEqual({ phase: 'RESULTS', day: 11 });
  });

  it('datas mal formadas ou inexistentes lançam erro', () => {
    expect(() => cyclePhase('2026-11-2', start)).toThrow(RangeError);
    expect(() => cyclePhase('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => cyclePhase(start, '2026-11-02T10:00')).toThrow(RangeError);
  });
});

describe('lisbonDate', () => {
  it('inverno: Lisboa = UTC', () => {
    expect(lisbonDate(new Date('2026-01-15T23:59:59Z'))).toBe('2026-01-15');
    expect(lisbonDate(new Date('2026-01-16T00:00:00Z'))).toBe('2026-01-16');
  });

  it('verão: Lisboa = UTC+1, a meia-noite é às 23:00 UTC', () => {
    expect(lisbonDate(new Date('2026-07-15T22:59:59Z'))).toBe('2026-07-15');
    expect(lisbonDate(new Date('2026-07-15T23:00:00Z'))).toBe('2026-07-16');
  });

  it('fim de março: muda de UTC para UTC+1 às 01:00 UTC de 2026-03-29', () => {
    expect(lisbonDate(new Date('2026-03-28T23:59:59Z'))).toBe('2026-03-28'); // 23:59:59, ainda inverno
    expect(lisbonDate(new Date('2026-03-29T00:00:00Z'))).toBe('2026-03-29');
    expect(lisbonDate(new Date('2026-03-29T22:59:59Z'))).toBe('2026-03-29'); // 23:59:59, já verão
    expect(lisbonDate(new Date('2026-03-29T23:00:00Z'))).toBe('2026-03-30');
  });

  it('fim de outubro: muda de UTC+1 para UTC às 01:00 UTC de 2026-10-25', () => {
    expect(lisbonDate(new Date('2026-10-24T22:59:59Z'))).toBe('2026-10-24'); // 23:59:59, ainda verão
    expect(lisbonDate(new Date('2026-10-24T23:00:00Z'))).toBe('2026-10-25');
    expect(lisbonDate(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-25'); // 23:00, já inverno
    expect(lisbonDate(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
  });

  it('com a hora de cron, o dia 25 de outubro tem 25 horas e conta como um só dia do ciclo', () => {
    const hours = Array.from({ length: 30 }, (_, h) => new Date(Date.UTC(2026, 9, 24, 23 + h)));
    const days = hours.map((d) => cyclePhase('2026-10-20', lisbonDate(d)).day);
    expect(days.filter((d) => d === 6)).toHaveLength(25);
  });
});
