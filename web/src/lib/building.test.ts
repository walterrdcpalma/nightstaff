import { describe, expect, it } from 'vitest';
import { resolveNight } from '../../../engine/index.ts';
import type { Action, NightSummary } from '../../../engine/index.ts';
import { avatarColor } from './cards.ts';
import {
  BUILDING_WIDTH,
  NAME_MAX_CHARS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  buildingHeight,
  buildingRooms,
  receptionY,
  roomLabel,
  shortName,
} from './building.ts';

const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, '0')}`);

/** Resumo real do motor para uma noite. */
function summaryOf(players: string[], actions: Action[]): NightSummary {
  return resolveNight({ players, night: 1, pastActions: [] }, actions, 1).summary;
}

describe('prédio do Bairro (T19)', () => {
  const P = ['ana', 'bruno', 'carla', 'duarte', 'eva'];
  // A Ana visita o Duarte, que está de Segurança: a Ana é apanhada. O Bruno desaparece.
  const summary = summaryOf(P, [
    { playerId: 'ana', type: 'ATTACK', targetId: 'duarte' },
    { playerId: 'bruno', type: 'VANISH' },
    { playerId: 'duarte', type: 'DEFEND' },
  ]);
  const byName = new Map(buildingRooms(summary, nameOf).map((r) => [r.name, r]));

  it('uma divisão por jogador, por nome, 2 por andar; a última fica sozinha se forem ímpares', () => {
    const rooms = buildingRooms(summary, nameOf);
    expect(rooms.map((r) => r.name)).toEqual(['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva']);
    expect(rooms.map((r) => [r.x, r.y])).toEqual([
      [24, 60],
      [188, 60],
      [24, 144],
      [188, 144],
      [24, 228],
    ]);
  });

  it('janela acesa = em casa, apagada = fora; a sirene só em quem foi apanhado', () => {
    expect(byName.get('Ana')).toMatchObject({ home: false, caught: true });
    expect(byName.get('Bruno')).toMatchObject({ home: false, caught: false });
    expect(byName.get('Carla')).toMatchObject({ home: true, caught: false });
    expect(byName.get('Duarte')).toMatchObject({ home: true, caught: false });
  });

  it('cada divisão diz o estado por palavras, não só pela cor, e nunca onde nem o quê', () => {
    expect(byName.get('Carla')!.label).toBe('Carla: em casa');
    expect(byName.get('Bruno')!.label).toBe('Bruno: fora');
    expect(byName.get('Ana')!.label).toBe('Ana: fora. 🚨 A Segurança deu com Ana');
    expect(roomLabel('Ana', false, true)).not.toMatch(/Duarte|casa d|Visita/);
  });

  it('a faixa e a inicial são as da T18: cor e inicial do id', () => {
    expect(byName.get('Ana')).toMatchObject({ initial: 'A', color: avatarColor('ana') });
  });

  it('nada além de casa/fora e apanhado chega ao desenho', () => {
    // Um resumo com coisas a mais (que nunca deviam lá estar) não as deixa passar.
    const leaky = {
      players: [{ playerId: 'ana', location: 'AWAY', type: 'ATTACK', targetId: 'bruno', delta: 10 }],
      caught: [],
      ledger: [{ playerId: 'ana', delta: 10 }],
      attacks: { ana: 'bruno' },
    } as unknown as NightSummary;
    const [room] = buildingRooms(leaky, nameOf);
    expect(Object.keys(room).sort()).toEqual(['caught', 'color', 'home', 'id', 'initial', 'label', 'name', 'shortName', 'x', 'y']);
    expect(JSON.stringify(room)).not.toMatch(/ATTACK|bruno|Bruno|delta|ledger|attacks|targetId/);
  });

  it('com 3 e com 12 jogadores: cabe na largura (sem scroll lateral), sem sobreposições, e cresce na vertical', () => {
    for (const n of [3, 12]) {
      const rooms = buildingRooms(summaryOf(ids(n), []), (id) => id);
      expect(rooms).toHaveLength(n);
      for (const r of rooms) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + ROOM_WIDTH).toBeLessThanOrEqual(BUILDING_WIDTH);
        expect(r.y + ROOM_HEIGHT).toBeLessThanOrEqual(receptionY(n));
      }
      for (const [i, a] of rooms.entries())
        for (const b of rooms.slice(i + 1)) {
          const apart = a.x + ROOM_WIDTH <= b.x || b.x + ROOM_WIDTH <= a.x || a.y + ROOM_HEIGHT <= b.y || b.y + ROOM_HEIGHT <= a.y;
          expect(apart).toBe(true);
        }
    }
    expect(buildingHeight(12)).toBeGreaterThan(buildingHeight(3));
    expect(buildingHeight(3)).toBe(buildingHeight(4)); // 2 andares nos dois casos
  });

  it('os nomes compridos são cortados, para caberem ao lado da janela', () => {
    expect(shortName('Ana')).toBe('Ana');
    expect(shortName('Bartolomeu Silva')).toBe('Bartolo…');
    expect(Array.from(shortName('Bartolomeu Silva'))).toHaveLength(NAME_MAX_CHARS);
    // Nos bots, sem o "Bot " (o nome inteiro fica no aria-label).
    expect(shortName('Bot Porteiro')).toBe('Porteiro');
    expect(shortName('Bot Rececionista')).toBe('Rececio…');
    expect(shortName('Bot')).toBe('Bot');
    const [bot] = buildingRooms({ players: [{ playerId: 'b1', location: 'HOME' }], caught: [] }, () => 'Bot Porteiro');
    expect(bot.label).toBe('Bot Porteiro: em casa');
  });
});
