// Bairro como rua ilustrada (T19): uma casa por jogador, com a janela acesa (em casa) ou apagada (fora) numa noite,
// e a sirene por cima de quem foi apanhado. Lógica pura, testada em street.test.ts. Só lê o resumo público da noite
// (RULES.md §4): casa/fora e apanhados. Nada mais chega ao desenho.
import type { NightSummary } from '../../../engine/index.ts';
import { avatarColor, avatarInitial } from './cards.ts';

/** Medidas de uma casa no SVG, em unidades do viewBox. */
export const HOUSE_WIDTH = 96;
export const STREET_HEIGHT = 184;
/** Nomes mais compridos são cortados, para não se encostarem à casa do lado. */
export const NAME_MAX_CHARS = 11;

export interface StreetHouse {
  id: string;
  name: string;
  /** Nome como cabe por baixo da casa. */
  shortName: string;
  initial: string;
  color: string;
  home: boolean;
  caught: boolean;
  /** Canto esquerdo da casa no SVG. */
  x: number;
  /** Para leitores de ecrã: o estado não depende só da cor. */
  label: string;
}

export function shortName(name: string, max = NAME_MAX_CHARS): string {
  const chars = Array.from(name.trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

export function houseLabel(name: string, home: boolean, caught: boolean): string {
  return `${name}: ${home ? 'em casa' : 'fora'}${caught ? `. 🚨 A Segurança deu com ${name}` : ''}`;
}

/** As casas de uma noite, por nome, lado a lado. Só quem aparece no resumo dessa noite. */
export function streetHouses(summary: NightSummary, nameOf: (id: string) => string): StreetHouse[] {
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
        x: i * HOUSE_WIDTH,
        label: houseLabel(p.name, p.home, caught),
      };
    });
}

/** Largura da rua no SVG. No mobile, a rua passa a largura do ecrã e faz-se scroll horizontal. */
export function streetWidth(houses: number): number {
  return Math.max(1, houses) * HOUSE_WIDTH;
}
