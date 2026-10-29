import { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { loadGames, loadLedger, loadNames, loadRanking } from '@/lib/data';
import type { Game } from '@/lib/data';
import { TIEBREAK_TEXT, attacksText, movementsByNight, points, rankingRows, rankingVisible } from '@/lib/points';
import type { LedgerRow, RankingDbRow } from '@/lib/points';
import { cn } from '@/lib/utils';
import { LoadError, Note, useLoad } from './Note.tsx';

interface Data {
  game: Game | null;
  names: Map<string, string>;
  /** Só o meu (RLS). */
  ledger: LedgerRow[];
  /** Vazio enquanto a partida não acaba (RLS). */
  ranking: RankingDbRow[];
}

/** A partida a mostrar: a mais recente que joguei nesta sala (depois de Reiniciar, a anterior até Começar). */
async function load(roomId: number): Promise<Data> {
  const [games, names] = await Promise.all([loadGames(roomId), loadNames()]);
  const game = games[0] ?? null;
  if (!game) return { game: null, names, ledger: [], ranking: [] };
  const [ledger, ranking] = await Promise.all([loadLedger(game.id), loadRanking(game.id)]);
  return { game, names, ledger, ranking };
}

/** Os meus pontos e movimentos; com a partida acabada, o ranking final e o Funcionário do Mês. */
export default function Points({ userId, roomId }: { userId: string; roomId: number }) {
  const { data, error, reload } = useLoad(useCallback(() => load(roomId), [roomId]));
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <p>A fazer as contas…</p>;
  if (!data.game) {
    return <Note title="Folha de pagamentos em branco">Ainda não houve nenhuma partida. Todos começam com 50 de salário.</Note>;
  }

  const nameOf = (id: string) => data.names.get(id) ?? '?';
  const mine = data.ledger.filter((r) => r.player_id === userId);
  const showRanking = rankingVisible(data.game.status) && data.ranking.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {showRanking && <Ranking ranking={data.ranking} userId={userId} nameOf={nameOf} />}
      {rankingVisible(data.game.status) && !showRanking && (
        <Note title="🏆 Funcionário do Mês">O ranking ainda está a ser apurado. Espreita daqui a pouco.</Note>
      )}

      <Note title="💰 Os teus pontos">
        <p className="font-heading text-4xl text-main">{points(mine)}</p>
        <p className="mb-4 text-sm">
          Salário de 50 + os teus movimentos. Só tu os vês; no fim da partida, o bairro só fica a saber o ranking.
        </p>
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

function Ranking(props: { ranking: RankingDbRow[]; userId: string; nameOf: (id: string) => string }) {
  const rows = rankingRows(props.ranking, props.nameOf);
  const winner = rows[0];
  return (
    <>
      <Note title="🏆 Funcionário do Mês">
        <p className="font-heading text-3xl text-main">{winner.name}</p>
        <p>
          {winner.points} pontos, {attacksText(winner.successfulAttacks)}.
          {winner.tiebreak && ` Decidido no desempate (${TIEBREAK_TEXT[winner.tiebreak]}).`}
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
                {r.tiebreak && <Badge variant="neutral">{r.tiebreak === 'ATTACKS' ? 'desempate: ataques' : 'desempate'}</Badge>}
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
