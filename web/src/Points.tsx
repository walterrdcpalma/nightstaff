import { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { loadEnrolled, loadGames, loadLedger, loadNames } from '@/lib/data';
import type { Game } from '@/lib/data';
import { movementsByNight, points, rankingRows, rankingVisible } from '@/lib/points';
import type { LedgerRow } from '@/lib/points';
import { cn } from '@/lib/utils';
import { LoadError, Note, useLoad } from './Note.tsx';

interface Data {
  game: Game | null;
  /** Há um ciclo novo em preparação e este é o anterior. */
  previous: boolean;
  names: Map<string, string>;
  ledger: LedgerRow[];
  enrolled: string[];
}

/**
 * O ciclo a mostrar: o mais recente; se estiver em preparação, o anterior (que já acabou),
 * para o ranking do último ciclo continuar consultável.
 */
async function load(): Promise<Data> {
  const [games, names] = await Promise.all([loadGames(), loadNames()]);
  const previous = games[0]?.status === 'prep';
  const game = previous ? (games[1] ?? null) : (games[0] ?? null);
  if (!game) return { game: null, previous, names, ledger: [], enrolled: [] };
  const [ledger, enrolled] = await Promise.all([loadLedger(game.id), loadEnrolled(game.id)]);
  return { game, previous, names, ledger, enrolled };
}

/** Os meus pontos e movimentos; no dia 11, o ranking final e o Funcionário do Mês. */
export default function Points({ userId }: { userId: string }) {
  const { data, error, reload } = useLoad(useCallback(load, []));
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <p>A fazer as contas…</p>;
  if (!data.game) {
    return <Note title="Folha de pagamentos em branco">Ainda não houve nenhum ciclo. Todos começam com 50 de salário.</Note>;
  }

  const nameOf = (id: string) => data.names.get(id) ?? '?';
  const mine = data.ledger.filter((r) => r.player_id === userId);
  const showRanking = rankingVisible(data.game.status) && data.game.seed !== null;

  return (
    <div className="flex flex-col gap-6">
      {data.previous && <p className="text-sm">Há um ciclo novo em preparação: lá, todos começam com 50. Isto é o ciclo anterior.</p>}
      {showRanking && <Ranking game={data.game} data={data} userId={userId} nameOf={nameOf} />}

      <Note title="💰 Os teus pontos">
        <p className="font-heading text-4xl text-main">{points(mine)}</p>
        <p className="mb-4 text-sm">Salário de 50 + os teus movimentos. Os pontos dos outros só se veem no fim do ciclo.</p>
        {mine.length === 0 && <p>Ainda sem movimentos.</p>}
        <ul className="flex flex-col gap-3">
          {movementsByNight(mine, nameOf).map((n) => (
            <li key={n.night}>
              <p className="font-heading">
                Noite {n.night}: {n.total}
              </p>
              {n.lines.map((l) => (
                <p key={l} className="text-sm">
                  {l}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </Note>
    </div>
  );
}

function Ranking(props: { game: Game; data: Data; userId: string; nameOf: (id: string) => string }) {
  const rows = rankingRows(props.data.enrolled, props.data.ledger, props.game.seed!, props.nameOf);
  const winner = rows[0];
  return (
    <>
      <Note title="🏆 Funcionário do Mês">
        <p className="font-heading text-3xl text-main">{winner.name}</p>
        <p>
          {winner.points} pontos, {winner.successfulAttacks} ataques bem-sucedidos.
          {winner.tiebreak && ' Decidido no desempate.'}
        </p>
      </Note>
      <Note title="📋 Ranking final">
        <ol className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.playerId}
              className={cn(
                'flex items-center justify-between gap-2 rounded-base border-2 border-border p-2',
                r.playerId === props.userId && 'bg-main text-main-foreground',
              )}
            >
              <span className="font-heading">
                {r.rank}. {r.name}
              </span>
              <span className="flex items-center gap-2">
                {r.tiebreak && <Badge variant="neutral">desempate</Badge>}
                <span className="tabular-nums">{r.points}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs">
          Desempate: ataques bem-sucedidos, confronto direto, menos pontos perdidos e, por fim, sorteio.
        </p>
      </Note>
    </>
  );
}
