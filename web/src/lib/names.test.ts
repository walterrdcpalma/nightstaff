import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from '../../../engine/index.ts';
import { REASON_TEXT } from './night.ts';
import { ACTION_NAMES } from './today.ts';

/** Todo o código do web/ que chega ao jogador (sem os testes), como texto. */
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

describe('nomes na UI (RULES.md §2 v7)', () => {
  it('a ação das bombas chama-se 🔥 Despedimento coletivo', () => {
    expect(ACTION_NAMES.BOMB).toBe('🔥 Despedimento coletivo');
    expect(REASON_TEXT.ATTACK_BOMBED).toBe('🗡️ Havia um Despedimento coletivo no alvo');
    expect(REASON_TEXT.ATTACK_AWAY_BOMBED).toBe('🗡️ Casa vazia, mas o Despedimento coletivo levou tudo');
    expect(REASON_TEXT.BOMBED).toBe('🔥 Um Despedimento coletivo apanhou-te');
  });

  it('regressão: nenhum texto do web/ diz "Reunião de emergência"', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const old = Object.entries(sources).filter(([, text]) => /Reuni[aã]o de emerg[eê]ncia/i.test(text));
    expect(old.map(([file]) => file)).toEqual([]);
  });

  it('todas as ações têm nome na app, e nenhum nome mostra o código', () => {
    for (const t of ACTION_TYPES) expect(ACTION_NAMES[t]).not.toMatch(/STAY|DEFEND|ATTACK|BOMB|VANISH/);
  });
});
