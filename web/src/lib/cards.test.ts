import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, QUOTAS, remainingQuota } from '../../../engine/index.ts';
import type { GameState } from '../../../engine/index.ts';
import { AVATAR_COLORS, QUOTA_EXHAUSTED_CARD_TEXT, actionCards, avatarColor, avatarInitial } from './cards.ts';
import { ACTION_NAMES } from './today.ts';

const full = { ...QUOTAS };

describe('cartas da escolha da noite (T18)', () => {
  it('uma carta por ação, pela ordem da app, com o nome na app e sem códigos', () => {
    const cards = actionCards(full, 'STAY');
    expect(cards.map((c) => c.type)).toEqual(ACTION_TYPES);
    expect(cards.map((c) => c.name)).toEqual(['🏠 Folga', '🛡️ Segurança', '🗡️ Visita surpresa', '🔥 Despedimento coletivo', '🫥 Desaparecer']);
    for (const c of cards) {
      expect(c.name).toBe(ACTION_NAMES[c.type]);
      expect(`${c.name} ${c.text}`).not.toMatch(/STAY|DEFEND|ATTACK|BOMB|VANISH/);
    }
  });

  it('a quota em pontinhos: cheios os que faltam gastar; a Folga não tem (∞)', () => {
    const cards = actionCards({ ...full, DEFEND: 1, BOMB: 0 }, 'STAY');
    const dots = (t: string) => cards.find((c) => c.type === t)!.dots;
    expect(dots('STAY')).toBeNull();
    expect(dots('DEFEND')).toEqual([true, false]);
    expect(dots('ATTACK')).toHaveLength(QUOTAS.ATTACK);
    expect(dots('ATTACK')!.every(Boolean)).toBe(true);
    expect(dots('BOMB')).toEqual(Array(QUOTAS.BOMB).fill(false));
  });

  it('com a quota esgotada, a carta fica desligada e diz porquê', () => {
    const cards = actionCards({ ...full, BOMB: 0 }, 'STAY');
    const bomb = cards.find((c) => c.type === 'BOMB')!;
    expect(bomb).toMatchObject({ disabled: true, reason: QUOTA_EXHAUSTED_CARD_TEXT });
    for (const c of cards.filter((c) => c.type !== 'BOMB')) expect(c).toMatchObject({ disabled: false, reason: null });
  });

  it('as quotas vêm do engine/: depois de gastar as Seguranças, a carta desliga-se', () => {
    const state: GameState = {
      players: ['eu', 'tu', 'ele'],
      night: 3,
      pastActions: [
        { night: 1, playerId: 'eu', type: 'DEFEND', targetId: null },
        { night: 2, playerId: 'eu', type: 'DEFEND', targetId: null },
      ],
    };
    const defend = actionCards(remainingQuota(state, 'eu'), 'STAY').find((c) => c.type === 'DEFEND')!;
    expect(defend.dots!.some(Boolean)).toBe(false);
    expect(defend.disabled).toBe(true);
  });

  it('só a escolha atual fica realçada', () => {
    const cards = actionCards(full, 'ATTACK');
    expect(cards.filter((c) => c.selected).map((c) => c.type)).toEqual(['ATTACK']);
  });
});

describe('avatares dos alvos', () => {
  it('a cor é estável e vem do id: o mesmo id dá sempre a mesma cor da paleta', () => {
    const id = '00000000-0000-0000-0000-0000000002a1';
    expect(avatarColor(id)).toBe(avatarColor(id));
    expect(AVATAR_COLORS).toContain(avatarColor(id));
  });

  it('ids diferentes espalham-se pela paleta', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    expect(new Set(ids.map(avatarColor)).size).toBeGreaterThan(AVATAR_COLORS.length / 2);
  });

  it('a inicial é a do nome; nos bots, a do posto', () => {
    expect(avatarInitial('ana')).toBe('A');
    expect(avatarInitial('  Bruno Costa ')).toBe('B');
    expect(avatarInitial('Bot Porteiro')).toBe('P');
    expect(avatarInitial('Bot')).toBe('B');
    expect(avatarInitial('Élia')).toBe('É');
    expect(avatarInitial('😀 Zé')).toBe('😀');
  });
});
