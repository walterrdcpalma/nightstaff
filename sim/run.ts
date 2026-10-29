// npm run sim -- [--games 1000] [--seed 1]
// Corre jogos de 8 bots em 3 configurações e imprime o relatório em Markdown.
import { BOTS } from './bots.ts';
import type { BotKind } from './bots.ts';
import { NIGHTS, playGame } from './game.ts';
import { summarize } from './stats.ts';
import type { Report, Spread } from './stats.ts';

export const CONFIGS: { name: string; seats: BotKind[] }[] = [
  { name: '8 aleatórios', seats: Array(8).fill('random') },
  { name: '8 espertos', seats: Array(8).fill('smart') },
  { name: '4 espertos + 4 aleatórios', seats: ['smart', 'random', 'smart', 'random', 'smart', 'random', 'smart', 'random'] },
];

export function runConfig(seats: BotKind[], games: number, seed: number): Report {
  const players = seats.map((_, i) => `P${i + 1}`);
  const kindOf = (p: string) => seats[players.indexOf(p)];
  const results = Array.from({ length: games }, (_, g) =>
    playGame(players.map((playerId, i) => ({ playerId, bot: BOTS[seats[i]] })), seed + g),
  );
  return summarize(results, kindOf);
}

const f1 = (x: number) => x.toFixed(1);
const fp = (x: number) => `${x.toFixed(1)}%`;
const fs = (s: Spread) => `${f1(s.mean)} ± ${f1(s.sd)} (min ${s.min}, p10 ${s.p10}, mediana ${s.p50}, p90 ${s.p90}, máx ${s.max})`;

export function formatReport(name: string, r: Report): string {
  const lines = [
    `### ${name}`,
    '',
    '| Métrica | Valor |',
    '|---|---|',
    `| Acertos por jogo (ataques + bombas, soma dos 8) | ${f1(r.hitsPerGame)} (${f1(r.attackHitsPerGame)} ataques + ${f1(r.bombHitsPerGame)} bombas) |`,
    `| Acertos por jogador por jogo | ${(r.hitsPerGame / 8).toFixed(2)} |`,
    `| Visitas surpresa que renderam pontos | ${fp(r.attackHitPct)} |`,
    `| Pontos finais (média ± desvio padrão) | ${fs(r.points)} |`,
    `| Jogadores com 0 ou menos | ${fp(r.zeroOrLessPct)} |`,
    `| Sorteios por jogo | ${f1(r.drawsPerGame)} (jogos com ≥1 sorteio: ${fp(r.gamesWithDrawPct)}) |`,
    `| Bombas por jogo | ${f1(r.bombsPerGame)} — acertaram ${fp(r.bombOutcomePct.hit)}, apanharam defesa ${fp(r.bombOutcomePct.defended)}, alvo fora ${fp(r.bombOutcomePct.targetAway)} |`,
    `| Vitória partilhada | ${fp(r.sharedWinPct)} dos jogos |`,
    `| Ações escolhidas | Folga ${fp(r.actionPct.STAY)}, Segurança ${fp(r.actionPct.DEFEND)}, Visita ${fp(r.actionPct.ATTACK)}, Reunião ${fp(r.actionPct.BOMB)} |`,
  ];
  const kinds = Object.entries(r.byKind);
  if (kinds.length > 1) {
    lines.push('', '| Bot | Lugares | Pontos finais | 0 ou menos | Jogos ganhos |', '|---|---|---|---|---|');
    for (const [kind, k] of kinds) {
      lines.push(`| ${kind} | ${k.seats} | ${fs(k.points)} | ${fp(k.zeroOrLessPct)} | ${fp(k.winPct)} |`);
    }
  }
  return lines.join('\n');
}

const argv: string[] = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const arg = (name: string, fallback: number) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};

if (argv[1]?.endsWith('run.ts')) {
  const games = arg('games', 1000);
  const seed = arg('seed', 1);
  console.log(`## Simulação: ${games} jogos × 8 jogadores × ${NIGHTS} noites (seed ${seed})\n`);
  for (const c of CONFIGS) console.log(formatReport(c.name, runConfig(c.seats, games, seed)) + '\n');
}
