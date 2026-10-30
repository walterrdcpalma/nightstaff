// Manhã em modo história (T12): a noite contada uma cena de cada vez, como um narrador. Lógica pura, testada
// em story.test.ts. Regra de ouro (RULES.md §4): as frases públicas só dizem casa/fora e quem foi apanhado,
// nunca a ação. O que aconteceu a cada um só aparece na cena privada, a do próprio.
// Frases com humor negro de bairro (T14): sobre as situações (a ex, as dívidas, o chefe, a mãe a ligar), nunca
// sobre quem as pessoas são. Nada de morte, doenças, origens, religião, orientação sexual, aparência ou grupos.
import { mulberry32, randomIndex } from '../../../engine/index.ts';
import type { NightSummary, PlayerId } from '../../../engine/index.ts';
import { morningHeadline } from './night.ts';

/**
 * Em casa: servem tanto para Folga como para Segurança. Sem género (o nome não diz se é "o" ou "a").
 * `{nome}` é trocado pelo nome do jogador.
 */
export const HOME_LINES = [
  '{nome} ficou em casa a ver o perfil da ex pela 14.ª vez. Só para ter a certeza de que continua feliz.',
  '{nome} passou a noite a ensaiar o discurso que nunca vai fazer ao chefe. Ficou ótimo. Ao espelho.',
  '{nome} ficou em casa a fazer contas às dívidas. As contas ganharam.',
  '{nome} ficou em casa a responder «sim, mãe» de cinco em cinco minutos.',
  '{nome} ficou no sofá a pensar na vida. A vida não retribuiu.',
  '{nome} passou a noite a ver vídeos de pessoas organizadas. Inspiração zero, culpa máxima.',
  'Em casa de {nome}, jantar de cereais. Outra vez. Ninguém precisa de saber.',
  '{nome} ficou em casa a curar a ressaca de ontem para estar em forma para a de amanhã.',
  '{nome} escreveu uma mensagem à ex, apagou, escreveu outra vez e foi dormir. Vitória moral.',
  '{nome} ficou em casa a planear a vida nova que começa segunda-feira. Como todas as semanas.',
  '{nome} passou a noite a ver anúncios de casas que nunca vai poder pagar.',
  '{nome} ficou em casa a fazer uma lista de objetivos. O primeiro era fazer a lista.',
  '{nome} ficou em casa a discutir com o assistente de voz. Perdeu.',
  '{nome} ficou a ver stories alheias até às 3 da manhã. A vida dos outros é sempre melhor às 3 da manhã.',
];

/** Fora: servem para Visita surpresa, Despedimento coletivo e Desaparecer. Sem género. */
export const AWAY_LINES = [
  '{nome} saiu sem dizer para onde. Passar pela rua da ex não foi de propósito.',
  '{nome} saiu para arejar as ideias. As ideias ficaram em casa.',
  '{nome} saiu para fugir à chamada da mãe. A mãe ligou na mesma.',
  '{nome} foi ao multibanco ver o saldo e voltou a pé, de cabeça baixa.',
  '{nome} teve uma crise existencial no corredor dos iogurtes do supermercado 24 horas.',
  '{nome} saiu para «só uma». Foram várias, e a conta também.',
  '{nome} saiu a meio da noite para comprar coisas de que não precisa com dinheiro que não tem.',
  'Janela apagada em casa de {nome}. Dizem que foi ver o pôr do sol. Às duas da manhã.',
  '{nome} saiu a ensaiar em voz alta o discurso para o chefe. Os vizinhos já o sabem de cor.',
  '{nome} foi dar uma volta para perceber onde é que a vida correu mal. Ainda vai a meio.',
  '{nome} saiu para fugir ao senhorio. O senhorio também saiu.',
  'A casa de {nome} ficou às escuras enquanto lá fora se tomavam más decisões.',
  '{nome} saiu sem casaco nem plano. Voltou com fome e menos dez euros.',
  '{nome} foi a uma festa sem convite. Ninguém reparou, o que é pior.',
];

/** Apanhados pela Segurança (RULES.md §4): sem dizer em que casa. Sem género. */
export const CAUGHT_LINES = [
  '🚨 A Segurança deu com {nome} a espreitar uma janela alheia. Garante que era para ver as estrelas.',
  '🚨 {nome} jurou à Segurança que só estava a passear o cão. {nome} não tem cão.',
  '🚨 A Segurança deu com {nome} às 3 da manhã. A desculpa foi «insónia». A cara dizia «arrependimento».',
  '🚨 {nome} tentou explicar-se à Segurança. Ficou pior.',
  '🚨 Lanterna na cara, e {nome} ainda perguntou se aquilo contava como horas extra.',
  '🚨 A Segurança deu com {nome} fora de horas. Já está no registo, ao lado das outras más ideias.',
  '🚨 {nome} disse à Segurança que se tinha enganado no caminho. Na vida, pelo menos, é verdade.',
  '🚨 A Segurança deu com {nome} onde não devia. O chefe vai saber de manhã, e a mãe à hora de almoço.',
  '🚨 {nome} ofereceu um café à Segurança para esquecer o assunto. A Segurança não bebe café.',
  '🚨 Mais uma noite, mais uma figura: a Segurança deu com {nome} em flagrante.',
  '🚨 {nome} tentou fazer de estátua. A Segurança não foi na conversa.',
  '🚨 A Segurança deu com {nome} e pediu explicações. {nome} ainda as está a inventar.',
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
