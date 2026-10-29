import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from '../../../engine/index.ts';
import { ACTION_NAMES, choiceText, errorText, formatCountdown, nextLisbonMidnight, todayPhase } from './today.ts';

describe('todayPhase', () => {
  const start = '2026-11-02';

  it('dia 1 em preparação: entrar ou sair', () => {
    expect(todayPhase(start, 'prep', '2026-11-02')).toEqual({ kind: 'PREP' });
  });

  it('dias 2 a 10 a correr: noites 1 a 9', () => {
    expect(todayPhase(start, 'running', '2026-11-03')).toEqual({ kind: 'NIGHT', night: 1 });
    expect(todayPhase(start, 'running', '2026-11-11')).toEqual({ kind: 'NIGHT', night: 9 });
  });

  it('dia 11 acabado: resolução', () => {
    expect(todayPhase(start, 'finished', '2026-11-12')).toEqual({ kind: 'RESULTS' });
  });

  it('entre as 00:00 e a resolve-night, o bairro está a acordar', () => {
    expect(todayPhase(start, 'prep', '2026-11-03')).toEqual({ kind: 'WAKING' }); // ainda não arrancou
    expect(todayPhase(start, 'running', '2026-11-12')).toEqual({ kind: 'WAKING' }); // noite 9 por resolver
    expect(todayPhase(start, 'finished', '2026-11-13')).toEqual({ kind: 'WAKING' }); // ciclo seguinte a chegar
  });
});

describe('nextLisbonMidnight', () => {
  it('verão (UTC+1) e inverno (UTC+0)', () => {
    expect(nextLisbonMidnight(new Date('2026-07-10T21:00:00Z')).toISOString()).toBe('2026-07-10T23:00:00.000Z');
    expect(nextLisbonMidnight(new Date('2026-12-10T21:00:00Z')).toISOString()).toBe('2026-12-11T00:00:00.000Z');
  });

  it('às 23:59:59 de Lisboa ainda falta 1 segundo', () => {
    const now = new Date('2026-12-10T23:59:59Z');
    expect(nextLisbonMidnight(now).getTime() - now.getTime()).toBe(1000);
  });

  it('às 00:00 em ponto o prazo é o da noite seguinte', () => {
    expect(nextLisbonMidnight(new Date('2026-12-11T00:00:00Z')).toISOString()).toBe('2026-12-12T00:00:00.000Z');
  });

  it('mudança de hora: fim de março (dia de 23 h) e fim de outubro (dia de 25 h)', () => {
    expect(nextLisbonMidnight(new Date('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect(nextLisbonMidnight(new Date('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(nextLisbonMidnight(new Date('2026-10-24T22:30:00Z')).toISOString()).toBe('2026-10-24T23:00:00.000Z'); // 23:30 de verão
  });
});

describe('textos', () => {
  it('contagem HH:MM:SS, nunca negativa', () => {
    expect(formatCountdown(3_723_000)).toBe('01:02:03');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('usa os nomes da app para todas as ações', () => {
    expect(ACTION_TYPES.map((t) => ACTION_NAMES[t])).toEqual([
      '🏠 Folga',
      '🛡️ Segurança',
      '🗡️ Visita surpresa',
      '💣 Reunião de emergência',
      '🫥 Desaparecer',
    ]);
    expect(choiceText('ATTACK', 'Bruno')).toBe('🗡️ Visita surpresa a Bruno');
    expect(choiceText('STAY')).toBe('🏠 Folga');
  });

  it('traduz os códigos da validação e da BD, e tem uma mensagem genérica', () => {
    expect(errorText('QUOTA_EXHAUSTED')).toBe('Já gastaste essa ação neste ciclo.');
    expect(errorText('NIGHT_CLOSED')).toBe('O prazo desta noite já fechou.');
    expect(errorText('SAME_TARGET')).toBe('Não podes ir à mesma casa duas noites seguidas.');
    expect(errorText('new row violates row-level security policy')).toBe('Algo correu mal. Tenta outra vez.');
  });
});
