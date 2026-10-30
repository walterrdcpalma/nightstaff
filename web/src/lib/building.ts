// Bairro como prédio ilustrado (T19, opção B do protótipo): letreiro "NIGHT STAFF", uma divisão por jogador em
// 2 colunas e a receção em baixo. Janela acesa (em casa) ou apagada (fora) numa noite, e a sirene de quem foi
// apanhado. Lógica pura, testada em building.test.ts. Só lê o resumo público da noite (RULES.md §4): casa/fora e
// apanhados. Nada mais chega ao desenho.
import type { NightSummary } from '../../../engine/index.ts';
import { avatarColor, avatarInitial } from './cards.ts';

/** Medidas do prédio, em unidades do viewBox. A largura é fixa: o SVG encolhe ao ecrã e cresce na vertical. */
export const BUILDING_WIDTH = 360;
export const ROOM_WIDTH = 148;
export const ROOM_HEIGHT = 72;
/** Distância entre o início de uma divisão e o da seguinte (coluna e andar). */
export const COLUMN_STEP = 164;
export const FLOOR_STEP = 84;
/** Canto da primeira divisão, por baixo do letreiro. */
export const FIRST_ROOM = { x: 24, y: 60 } as const;
export const RECEPTION_HEIGHT = 42;
/** Nomes mais compridos são cortados, para caberem ao lado da janela. */
export const NAME_MAX_CHARS = 8;

export interface BuildingRoom {
  id: string;
  name: string;
  /** Nome como cabe na divisão. */
  shortName: string;
  initial: string;
  color: string;
  home: boolean;
  caught: boolean;
  /** Canto superior esquerdo da divisão no SVG. */
  x: number;
  y: number;
  /** Para leitores de ecrã: o estado não depende só da cor. */
  label: string;
}

/** Nome curto para a divisão. Nos bots sai o "Bot " (seriam todos "Bot Rec…"); o nome inteiro fica no `aria-label`. */
export function shortName(name: string, max = NAME_MAX_CHARS): string {
  const chars = Array.from(name.trim().replace(/^Bot\s+(?=\S)/, ''));
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

/** "Ana: em casa", "Ana: fora", e a sirene sem género e sem dizer onde. */
export function roomLabel(name: string, home: boolean, caught: boolean): string {
  return `${name}: ${home ? 'em casa' : 'fora'}${caught ? `. 🚨 A Segurança deu com ${name}` : ''}`;
}

export function floors(rooms: number): number {
  return Math.ceil(Math.max(1, rooms) / 2);
}

/** Onde começa a receção: por baixo do último andar. */
export function receptionY(rooms: number): number {
  return FIRST_ROOM.y + floors(rooms) * FLOOR_STEP + 12;
}

/** Altura do prédio no SVG: cresce um andar por cada par de jogadores. */
export function buildingHeight(rooms: number): number {
  return receptionY(rooms) + RECEPTION_HEIGHT + 8;
}

/** As divisões de uma noite, por nome: 2 por andar, e a última sozinha se forem ímpares. Só quem está no resumo. */
export function buildingRooms(summary: NightSummary, nameOf: (id: string) => string): BuildingRoom[] {
  return summary.players
    .map((p) => ({ id: p.playerId, name: nameOf(p.playerId), home: p.location === 'HOME' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'))
    .map((p, i) => {
      const caught = summary.caught.includes(p.id);
      return {
        id: p.id,
        name: p.name,
        shortName: shortName(p.name),
        initial: avatarInitial(p.name),
        color: avatarColor(p.id),
        home: p.home,
        caught,
        x: FIRST_ROOM.x + (i % 2) * COLUMN_STEP,
        y: FIRST_ROOM.y + Math.floor(i / 2) * FLOOR_STEP,
        label: roomLabel(p.name, p.home, caught),
      };
    });
}
