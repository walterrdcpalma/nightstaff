// Manhã em modo história (T12): a noite contada uma cena de cada vez, como um narrador. Lógica pura, testada
// em story.test.ts. Regra de ouro (RULES.md §4): as frases públicas só dizem casa/fora e quem foi apanhado,
// nunca a ação. O que aconteceu a cada um só aparece na cena privada, a do próprio.
import { mulberry32, randomIndex } from '../../../engine/index.ts';
import type { NightSummary, PlayerId } from '../../../engine/index.ts';
import { morningHeadline } from './night.ts';

/**
 * Em casa: servem tanto para Folga como para Segurança. Sem género (o nome não diz se é "o" ou "a").
 * `{nome}` é trocado pelo nome do jogador.
 */
export const HOME_LINES = [
  '{nome} ficou em casa a fazer uma francesinha.',
  '{nome} passou a noite no sofá, de comando na mão.',
  'Luz acesa em casa de {nome}: maratona de novelas até às tantas.',
  '{nome} ficou em casa a regar os vasos da varanda.',
  '{nome} não pôs o pé na rua: jantar de restos e cama cedo.',
  'Em casa de {nome} cheirou a bacalhau a noite toda.',
  '{nome} ficou em casa a discutir futebol ao telefone.',
  '{nome} passou a noite a dobrar roupa e a ouvir fado.',
  '{nome} ficou por casa a montar um móvel sueco. Sobraram parafusos.',
  'Noite de pantufas para {nome}.',
  '{nome} ficou em casa a fazer palavras cruzadas.',
  '{nome} adormeceu no sofá antes de o telejornal acabar.',
];

/** Fora: servem para Visita surpresa, Despedimento coletivo e Desaparecer. Sem género. */
export const AWAY_LINES = [
  '{nome} saiu sem dizer para onde… talvez a pensar na ex.',
  'A casa de {nome} ficou às escuras a noite toda.',
  '{nome} saiu de casaco e boné. Ninguém sabe a que horas voltou.',
  '{nome} meteu-se no último autocarro da noite.',
  'Janela apagada em casa de {nome}. O gato ficou com o sofá só para ele.',
  '{nome} saiu a dizer que ia só ao café. Já lá vão horas.',
  'Ninguém viu {nome} sair, mas a casa ficou vazia.',
  '{nome} foi dar uma volta ao bairro e não voltou cedo.',
  '{nome} saiu à pressa, com as chaves do carro na mão.',
  'Dizem que {nome} passou a noite na tasca do Zé.',
  '{nome} saiu para levar o lixo e esqueceu-se de voltar.',
  'A luz de {nome} apagou-se cedo e o carro não estava à porta.',
];

/** Apanhados pela Segurança (RULES.md §4): sem dizer em que casa. Sem género. */
export const CAUGHT_LINES = [
  '🚨 A Segurança deu com {nome} a meio da noite.',
  '🚨 {nome} levou com a lanterna da Segurança na cara.',
  '🚨 A Segurança encontrou {nome} no sítio errado, à hora errada.',
  '🚨 {nome} jurou que se tinha enganado na porta. A Segurança não acreditou.',
  '🚨 Ouviu-se um apito e lá estava {nome}, sem desculpa.',
  '🚨 A Segurança fez a ronda e deu com {nome} onde não devia.',
  '🚨 {nome} vai ter de explicar ao chefe o que fazia ali.',
  '🚨 Lanterna, apito e {nome} de mãos no ar.',
  '🚨 A Segurança deu com {nome} a meio do caminho.',
  '🚨 {nome} saiu de fininho, mas não o suficiente.',
];

/**
 * Palavras que revelam a ação (RULES.md §4) e não podem aparecer nas frases de casa e fora. Comparadas sem
 * acentos e em minúsculas.
 */
export const FORBIDDEN_WORDS = [
  'seguranca',
  'defend',
  'defes',
  'guarda',
  'vigia',
  'tranc',
  'ataq',
  'atac',
  'visita',
  'surpresa',
  'bomba',
  'reuni',
  'despedi',
  'demiss',
  'desaparec',
  'sumiu',
  'escond',
  'assalt',
  'roub',
  'apanh',
  'emboscad',
  'alarme',
];

/** Sem acentos e em minúsculas, para comparar com `FORBIDDEN_WORDS`. */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Palavras proibidas que a frase contém (vazio se não revela nada). */
export function forbiddenIn(line: string): string[] {
  const p = plain(line);
  return FORBIDDEN_WORDS.filter((w) => p.includes(w));
}

/** Troca `{nome}` pelo nome. */
export function fill(line: string, name: string): string {
  return line.replaceAll('{nome}', name);
}

/** Número de 32 bits a partir do id do jogador (FNV-1a), para misturar com a seed da noite. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

type Category = 'HOME' | 'AWAY' | 'CAUGHT';
const LINES: Record<Category, string[]> = { HOME: HOME_LINES, AWAY: AWAY_LINES, CAUGHT: CAUGHT_LINES };
const SALT: Record<Category, number> = { HOME: 0x9e3779b9, AWAY: 0x85ebca6b, CAUGHT: 0xc2b2ae35 };

/**
 * Frase de cada jogador numa categoria: sai da seed da noite e do id do jogador (`mulberry32`), nunca de
 * `Math.random()`. Toda a gente vê a mesma história, e ela não muda ao recarregar. Na mesma noite, dois
 * jogadores não repetem frase enquanto houver frases livres (por ordem de id, para ser estável).
 */
export function pickLines(category: Category, seed: number, playerIds: PlayerId[]): Map<PlayerId, string> {
  const lines = LINES[category];
  const used = new Set<number>();
  const out = new Map<PlayerId, string>();
  for (const id of [...playerIds].sort()) {
    const rng = mulberry32((seed ^ hashId(id) ^ SALT[category]) >>> 0);
    // Ao calhas entre as frases ainda livres (todas, se já se usaram todas), para nenhuma ter mais peso.
    const free = lines.map((_, i) => i).filter((i) => !used.has(i));
    const pool = free.length > 0 ? free : lines.map((_, i) => i);
    const i = pool[randomIndex(rng, pool.length)];
    used.add(i);
    out.set(id, lines[i]);
  }
  return out;
}

export type Scene =
  | { kind: 'OPENING'; night: number; text: string }
  | { kind: 'PLAYER'; playerId: PlayerId; home: boolean; text: string }
  | { kind: 'CAUGHT'; lines: string[] }
  | { kind: 'MINE' };

/**
 * As cenas da manhã, por ordem: abertura (noite e quantos em casa e fora), uma por jogador (por nome), os
 * apanhados (só se houver) e, por fim, a minha noite (o relatório privado, que o ecrã lê do meu ledger).
 */
export function storyScenes(night: { night: number; seed: number; summary: NightSummary }, nameOf: (id: PlayerId) => string): Scene[] {
  const { players, caught } = night.summary;
  const homeIds = players.filter((p) => p.location === 'HOME').map((p) => p.playerId);
  const awayIds = players.filter((p) => p.location === 'AWAY').map((p) => p.playerId);
  const home = pickLines('HOME', night.seed, homeIds);
  const away = pickLines('AWAY', night.seed, awayIds);
  const caughtLines = pickLines('CAUGHT', night.seed, caught);

  const scenes: Scene[] = [{ kind: 'OPENING', night: night.night, text: morningHeadline(night.night, night.summary) }];
  const byName = [...players].sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)));
  for (const p of byName) {
    const isHome = p.location === 'HOME';
    const line = (isHome ? home : away).get(p.playerId)!;
    scenes.push({ kind: 'PLAYER', playerId: p.playerId, home: isHome, text: fill(line, nameOf(p.playerId)) });
  }
  if (caught.length > 0) {
    const sorted = [...caught].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    scenes.push({ kind: 'CAUGHT', lines: sorted.map((id) => fill(caughtLines.get(id)!, nameOf(id))) });
  }
  scenes.push({ kind: 'MINE' });
  return scenes;
}
