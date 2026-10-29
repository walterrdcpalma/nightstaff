import { useCallback } from 'react';
import { loadMyEntries } from '@/lib/data';
import type { ResolvedNight } from '@/lib/data';
import { caughtHeadline, morningHeadline, privateReport } from '@/lib/night';
import { LoadError, Note, useLoad } from './Note.tsx';

/**
 * Manhã de uma noite (RULES.md §4 v5): o meu relatório privado (o que me aconteceu e os meus pontos da noite,
 * só do meu ledger) e as manchetes públicas (casa/fora e quem foi apanhado, sem dizer onde).
 */
export function NightView(props: { gameId: number; night: ResolvedNight; names: Map<string, string>; userId: string }) {
  const { gameId, night, names, userId } = props;
  const nameOf = (id: string) => names.get(id) ?? '?';
  const mine = useLoad(useCallback(() => loadMyEntries(gameId, night.night, userId), [gameId, night.night, userId]));
  const where = night.summary.players.find((s) => s.playerId === userId)?.location;
  const caught = caughtHeadline(night.summary, nameOf);
  const report = mine.data && privateReport(mine.data, nameOf);

  return (
    <div className="flex flex-col gap-6">
      <Note title={`☀️ A tua noite ${night.night}`}>
        {mine.error ? (
          <LoadError onRetry={mine.reload} />
        ) : !report ? (
          <p>A ler o teu relatório…</p>
        ) : (
          <div className="flex flex-col gap-1">
            {where && <p className="text-sm">{where === 'HOME' ? '🪟 Ficaste em casa.' : '🌑 Estiveste fora.'}</p>}
            {report.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p className="mt-2 font-heading">
              Pontos da noite: <span className="text-main">{report.total}</span>
            </p>
            <p className="text-xs">Só tu vês isto.</p>
          </div>
        )}
      </Note>

      <Note title="📰 Manchetes do bairro">
        <div className="flex flex-col gap-2">
          <p>{morningHeadline(night.night, night.summary)}</p>
          <p className={caught ? 'font-heading text-danger' : ''}>{caught ?? 'Ninguém foi apanhado.'}</p>
        </div>
      </Note>
    </div>
  );
}
