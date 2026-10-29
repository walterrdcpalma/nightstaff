import { describe, expect, it } from 'vitest';
import { addDays, lisbonDate, nightOn } from './cycle.ts';

describe('nightOn', () => {
  const start = '2026-11-02';

  it('a noite 1 é o dia em que o admin carrega em Começar', () => {
    expect(nightOn(start, '2026-11-02')).toBe(1);
  });

  it('as noites seguem-se sem saltos, dia a dia, e passam da 9', () => {
    const nights = Array.from({ length: 10 }, (_, i) => nightOn('2026-01-01', `2026-01-${String(i + 1).padStart(2, '0')}`));
    expect(nights).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(nightOn(start, '2026-11-01')).toBe(0);
  });

  it('atravessa meses e anos', () => {
    expect(nightOn('2026-12-28', '2027-01-05')).toBe(9);
    expect(nightOn('2028-02-25', '2028-03-01')).toBe(6); // 2028 é bissexto
  });

  it('mudança de hora no fim de março e no fim de outubro não estraga a contagem', () => {
    expect(nightOn('2026-03-25', '2026-03-29')).toBe(5);
    expect(nightOn('2026-03-25', '2026-04-02')).toBe(9);
    expect(nightOn('2026-10-20', '2026-10-25')).toBe(6);
    expect(nightOn('2026-10-20', '2026-10-28')).toBe(9);
  });

  it('datas mal formadas ou inexistentes lançam erro', () => {
    expect(() => nightOn('2026-11-2', start)).toThrow(RangeError);
    expect(() => nightOn('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => nightOn(start, '2026-11-02T10:00')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('conta dias de calendário, também na mudança de hora', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 11)).toBe('2027-01-11');
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

  it('com a hora de cron, o dia 25 de outubro tem 25 horas e conta como uma só noite', () => {
    const hours = Array.from({ length: 30 }, (_, h) => new Date(Date.UTC(2026, 9, 24, 23 + h)));
    const nights = hours.map((d) => nightOn('2026-10-20', lisbonDate(d)));
    expect(nights.filter((n) => n === 6)).toHaveLength(25);
  });
});
