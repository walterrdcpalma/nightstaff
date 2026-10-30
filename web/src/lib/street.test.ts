import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, NightSummary } from '../../../engine/index.ts';
import { avatarColor } from './cards.ts';
import { HOUSE_WIDTH, NAME_MAX_CHARS, houseLabel, shortName, streetHouses, streetWidth } from './street.ts';

const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, '0')}`);

/** Resumo real do motor para uma noite. */
function summaryOf(players: string[], actions: Action[]): NightSummary {
  return resolveNight({ players, night: 1, pastActions: [] }, actions, 1).summary;
}

describe('rua do Bairro (T19)', () => {
  const P = ['ana', 'bruno', 'carla', 'duarte'];
  // A Ana visita o Duarte, que está de Segurança: a Ana é apanhada. O Bruno desaparece.
  const summary = summaryOf(P, [
    { playerId: 'ana', type: 'ATTACK', targetId: 'duarte' },
    { playerId: 'bruno', type: 'VANISH' },
    { playerId: 'duarte', type: 'DEFEND' },
  ]);

  it('uma casa por jogador, por nome, lado a lado', () => {
    const houses = streetHouses(summary, nameOf);
    expect(houses.map((h) => h.name)).toEqual(['Ana', 'Bruno', 'Carla', 'Duarte']);
    expect(houses.map((h) => h.x)).toEqual([0, HOUSE_WIDTH, 2 * HOUSE_WIDTH, 3 * HOUSE_WIDTH]);
  });

  it('janela acesa = em casa, apagada = fora; a sirene só em quem foi apanhado', () => {
    const byName = new Map(streetHouses(summary, nameOf).map((h) => [h.name, h]));
    expect(byName.get('Ana')).toMatchObject({ home: false, caught: true });
    expect(byName.get('Bruno')).toMatchObject({ home: false, caught: false });
    expect(byName.get('Carla')).toMatchObject({ home: true, caught: false });
    expect(byName.get('Duarte')).toMatchObject({ home: true, caught: false });
  });

  it('cada casa diz o estado por palavras, não só pela cor', () => {
    const byName = new Map(streetHouses(summary, nameOf).map((h) => [h.name, h]));
    expect(byName.get('Carla')!.label).toBe('Carla: em casa');
    expect(byName.get('Bruno')!.label).toBe('Bruno: fora');
    expect(byName.get('Ana')!.label).toBe('Ana: fora. 🚨 A Segurança deu com Ana');
    // Nunca diz onde foi apanhado, nem o que cada um fez.
    expect(houseLabel('Ana', false, true)).not.toMatch(/Duarte|casa d|Visita/);
  });

  it('o avatar é o da T18: inicial e cor do id', () => {
    const ana = streetHouses(summary, nameOf).find((h) => h.name === 'Ana')!;
    expect(ana.initial).toBe('A');
    expect(ana.color).toBe(avatarColor('ana'));
  });

  it('nada além de casa/fora e apanhado chega ao desenho', () => {
    // Um resumo com coisas a mais (que nunca deviam lá estar) não as deixa passar.
    const leaky = {
      players: [{ playerId: 'ana', location: 'AWAY', type: 'ATTACK', targetId: 'bruno', delta: 10 }],
      caught: [],
      ledger: [{ playerId: 'ana', delta: 10 }],
      attacks: { ana: 'bruno' },
    } as unknown as NightSummary;
    const [house] = streetHouses(leaky, nameOf);
    expect(Object.keys(house).sort()).toEqual(['caught', 'color', 'home', 'id', 'initial', 'label', 'name', 'shortName', 'x']);
    expect(JSON.stringify(house)).not.toMatch(/ATTACK|bruno|Bruno|delta|ledger|attacks|targetId/);
  });

  it('com 3 jogadores e com 12, todas as casas cabem lado a lado, sem se sobreporem', () => {
    for (const n of [3, 12]) {
      const players = ids(n);
      const houses = streetHouses(summaryOf(players, []), (id) => id);
      expect(houses).toHaveLength(n);
      expect(streetWidth(n)).toBe(n * HOUSE_WIDTH);
      for (const [i, h] of houses.entries()) {
        expect(h.x).toBe(i * HOUSE_WIDTH);
        expect(h.x + HOUSE_WIDTH).toBeLessThanOrEqual(streetWidth(n));
      }
    }
  });

  it('os nomes compridos são cortados, para não pisar a casa do lado', () => {
    expect(shortName('Ana')).toBe('Ana');
    expect(shortName('Bot Rececionista')).toBe('Bot Receci…');
    expect(Array.from(shortName('Bot Rececionista'))).toHaveLength(NAME_MAX_CHARS);
    expect(shortName('Zé 😀😀😀😀😀😀😀😀😀😀')).toHaveLength('Zé 😀😀😀😀😀😀😀…'.length);
  });
});
