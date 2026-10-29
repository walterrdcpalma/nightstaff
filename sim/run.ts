// npm run sim -- [--cycles 1000] [--seed 1]
// Corre ciclos com 3, 5, 8 e 12 bots, em 3 configurações cada, e imprime o relatório em Markdown.
import { BOTS } from './bots.ts';
import type { BotKind } from './bots.ts';
import { NIGHTS, playGame } from './game.ts';
import { summarize } from './stats.ts';
import type { Report } from './stats.ts';

export const PLAYER_COUNTS = [3, 5, 8, 12];

export function configsFor(n: number): { name: string; seats: BotKind[] }[] {
  return [
    { name: 'Aleatórios', seats: Array(n).fill('random') },
    { name: 'Espertos', seats: Array(n).fill('smart') },
    { name: 'Mistos', seats: Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'smart' : 'random')) },
  ];
}

export function runConfig(seats: BotKind[], cycles: number, seed: number): Report {
  const players = seats.map((_, i) => `P${i + 1}`);
  const kindOf = (p: string) => seats[players.indexOf(p)];
  const results = Array.from({ length: cycles }, (_, g) =>
    playGame(players.map((playerId, i) => ({ playerId, bot: BOTS[seats[i]] })), seed + g),
  );
  return summarize(results, kindOf);
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const fp = (x: number) => `${x.toFixed(1)}%`;

/** Uma tabela por número de jogadores: métricas nas linhas, configurações nas colunas. */
export function formatTable(players: number, reports: { name: string; report: Report }[]): string {
  const row = (label: string, cell: (r: Report) => string) =>
    `| ${label} | ${reports.map(({ report }) => cell(report)).join(' | ')} |`;

  const lines = [
    `### ${players} jogadores`,
    '',
    `| Métrica | ${reports.map((r) => r.name).join(' | ')} |`,
    `|---|${reports.map(() => '---').join('|')}|`,
    row('Acertos por ciclo (ataques em casa + assaltos + bombas, soma de todos)', (r) => `${f1(r.hitsPerGame)} (${f1(r.attackHitsPerGame)} + ${f1(r.burglaryHitsPerGame)} + ${f1(r.bombHitsPerGame)})`),
    row('Acertos por jogador por ciclo', (r) => f2(r.hitsPerGame / r.players)),
    row('Visitas surpresa que renderam pontos', (r) => fp(r.attackHitPct)),
    row('Pontos finais (com salário): média ± desvio padrão', (r) => `${f1(r.points.mean)} ± ${f1(r.points.sd)}`),
    row('Pontos finais: mín / p10 / mediana / p90 / máx', (r) => `${r.points.min} / ${r.points.p10} / ${r.points.p50} / ${r.points.p90} / ${r.points.max}`),
    row('Jogadores sem salário (< 0 pontos)', (r) => fp(r.noSalaryPct)),
    row('Sorteios por ciclo', (r) => f2(r.drawsPerGame)),
    row('Ciclos com ≥1 sorteio', (r) => fp(r.gamesWithDrawPct)),
    row('Bombas por ciclo', (r) => f1(r.bombsPerGame)),
    row('Bombas: alvo em casa / alvo fora / defesa', (r) => `${f1(r.bombOutcomePct.home)} / ${f1(r.bombOutcomePct.away)} / ${f1(r.bombOutcomePct.defended)} %`),
    row('Funcionário do Mês decidido no desempate', (r) => fp(r.tiebreakWinPct)),
    row('Viragem na noite 9 (o vencedor não liderava antes)', (r) => fp(r.lastNightSwingPct)),
    row('Ações: Folga / Segurança / Visita / Despedimento / Desaparecer', (r) => `${f1(r.actionPct.STAY)} / ${f1(r.actionPct.DEFEND)} / ${f1(r.actionPct.ATTACK)} / ${f1(r.actionPct.BOMB)} / ${f1(r.actionPct.VANISH)} %`),
  ];

  for (const { name, report } of reports) {
    const kinds = Object.entries(report.byKind);
    if (kinds.length < 2) continue;
    lines.push(
      '',
      `**${name}, esperto vs aleatório:**`,
      '',
      '| Bot | Lugares | Pontos finais (média ± dp) | Sem salário | Ciclos ganhos | Esperado pelos lugares |',
      '|---|---|---|---|---|---|',
    );
    for (const [kind, k] of kinds) {
      lines.push(
        `| ${kind} | ${k.seats} | ${f1(k.points.mean)} ± ${f1(k.points.sd)} | ${fp(k.noSalaryPct)} | ${fp(k.winPct)} | ${fp((100 * k.seats) / report.players)} |`,
      );
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
  const cycles = arg('cycles', 1000);
  const seed = arg('seed', 1);
  console.log(`## Simulação: ${cycles} ciclos por configuração × ${NIGHTS} noites (seed ${seed})\n`);
  for (const n of PLAYER_COUNTS) {
    const reports = configsFor(n).map((c) => ({ name: c.name, report: runConfig(c.seats, cycles, seed) }));
    console.log(formatTable(n, reports) + '\n');
  }
}
