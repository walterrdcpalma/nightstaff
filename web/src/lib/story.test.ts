import { describe, expect, it } from 'vitest';
import type { NightSummary } from '../../../engine/index.ts';
import { AWAY_LINES, CAUGHT_LINES, HOME_LINES, fill, forbiddenIn, pickLines, plain, storyScenes } from './story.ts';

const names: Record<string, string> = { a: 'Ana', b: 'Bruno', c: 'Carla', d: 'Duarte', e: 'Eva' };
const nameOf = (id: string) => names[id];
const summary = (home: string[], away: string[], caught: string[] = []): NightSummary => ({
  players: [...home.map((playerId) => ({ playerId, location: 'HOME' as const })), ...away.map((playerId) => ({ playerId, location: 'AWAY' as const }))],
  caught,
});

describe('frases', () => {
  it('cada categoria tem pelo menos 10 frases, sem repetidas, e todas com {nome}', () => {
    for (const lines of [HOME_LINES, AWAY_LINES, CAUGHT_LINES]) {
      expect(lines.length).toBeGreaterThanOrEqual(10);
      expect(new Set(lines).size).toBe(lines.length);
      for (const l of lines) expect(l).toContain('{nome}');
    }
  });

  it('regra de ouro (RULES.md §4): nenhuma frase de casa ou fora revela a ação', () => {
    for (const l of [...HOME_LINES, ...AWAY_LINES]) expect(forbiddenIn(l), l).toEqual([]);
  });

  it('a lista proibida apanha as ações, também com acentos e maiúsculas', () => {
    expect(forbiddenIn('{nome} montou a Segurança à porta')).toEqual(['seguranca']);
    expect(forbiddenIn('{nome} foi fazer uma VISITA surpresa')).toEqual(['visita', 'surpresa']);
    expect(forbiddenIn('{nome} levou uma bomba para a Reunião')).toEqual(['bomba', 'reuni']);
    expect(forbiddenIn('{nome} preparou um Despedimento coletivo')).toEqual(['despedi']);
    expect(forbiddenIn('{nome} trancou a porta e ficou de vigia')).toEqual(['vigia', 'tranc']);
    expect(forbiddenIn('{nome} desapareceu')).toEqual(['desaparec']);
    expect(plain('Reunião')).toBe('reuniao');
  });

  it('o nome entra no lugar de {nome}', () => {
    expect(fill('Noite de pantufas para {nome}.', 'Ana')).toBe('Noite de pantufas para Ana.');
  });
});

describe('escolha determinística', () => {
  it('a mesma seed dá sempre as mesmas frases, e não depende da ordem dos jogadores', () => {
    const one = pickLines('HOME', 42, ['a', 'b', 'c']);
    expect(pickLines('HOME', 42, ['c', 'a', 'b'])).toEqual(one);
    expect(storyScenes({ night: 3, seed: 42, summary: summary(['a', 'b'], ['c']) }, nameOf)).toEqual(
      storyScenes({ night: 3, seed: 42, summary: summary(['a', 'b'], ['c']) }, nameOf),
    );
  });

  it('seeds diferentes dão histórias diferentes', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const stories = new Set(Array.from({ length: 20 }, (_, seed) => JSON.stringify([...pickLines('AWAY', seed, ids)])));
    expect(stories.size).toBeGreaterThan(1);
  });

  it('na mesma noite, dois jogadores não repetem frase enquanto houver frases', () => {
    const ids = Array.from({ length: HOME_LINES.length }, (_, i) => `p${i}`);
    expect(new Set(pickLines('HOME', 7, ids).values()).size).toBe(HOME_LINES.length);
    // Com mais jogadores do que frases, repete, mas dá frase a todos.
    expect(pickLines('HOME', 7, [...ids, 'extra']).size).toBe(HOME_LINES.length + 1);
  });

  it('seeds negativas (colunas integer) também funcionam', () => {
    expect(pickLines('CAUGHT', -123456789, ['a']).get('a')).toBeDefined();
  });
});

describe('cenas', () => {
  it('pela ordem: abertura, um jogador de cada vez (por nome), apanhados e a minha noite', () => {
    const scenes = storyScenes({ night: 4, seed: 9, summary: summary(['c', 'a'], ['e', 'b'], ['e']) }, nameOf);
    expect(scenes.map((s) => s.kind)).toEqual(['OPENING', 'PLAYER', 'PLAYER', 'PLAYER', 'PLAYER', 'CAUGHT', 'MINE']);
    expect(scenes[0]).toEqual({ kind: 'OPENING', night: 4, text: 'Noite 4: 2 em casa, 2 fora.' });
    const players = scenes.filter((s) => s.kind === 'PLAYER');
    expect(players.map((s) => [s.playerId, s.home])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
      ['e', false],
    ]);
    for (const s of players) {
      expect(s.text).toContain(nameOf(s.playerId));
      expect(s.text).not.toContain('{nome}');
      const template = s.home ? HOME_LINES : AWAY_LINES;
      expect(template.map((l) => fill(l, nameOf(s.playerId)))).toContain(s.text);
    }
    const caught = scenes.find((s) => s.kind === 'CAUGHT');
    expect(caught?.kind === 'CAUGHT' && caught.lines).toHaveLength(1);
    expect(caught?.kind === 'CAUGHT' && caught.lines[0]).toContain('Eva');
  });

  it('sem apanhados, não há cena de apanhados', () => {
    const scenes = storyScenes({ night: 1, seed: 1, summary: summary(['a', 'b'], ['c']) }, nameOf);
    expect(scenes.map((s) => s.kind)).toEqual(['OPENING', 'PLAYER', 'PLAYER', 'PLAYER', 'MINE']);
  });

  it('as cenas públicas não dizem nada além de casa/fora e quem foi apanhado', () => {
    const scenes = storyScenes({ night: 2, seed: 5, summary: summary(['a'], ['b', 'c'], ['b']) }, nameOf);
    for (const s of scenes) if (s.kind === 'PLAYER') expect(forbiddenIn(s.text)).toEqual([]);
  });
});
