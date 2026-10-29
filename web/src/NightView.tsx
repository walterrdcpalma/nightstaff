import { useCallback } from 'react';
import { loadMyEntries } from '@/lib/data';
import type { ResolvedNight } from '@/lib/data';
import { caughtHeadline, morningHeadline, myResultLines } from '@/lib/night';
import { LoadError, Note, useLoad } from './Note.tsx';

/** Resumo público de uma noite (RULES.md §4: casa/fora e apanhados) e o meu resultado, que só eu vejo. */
export function NightView(props: { gameId: number; night: ResolvedNight; names: Map<string, string>; userId: string }) {
  const { gameId, night, names, userId } = props;
  const nameOf = (id: string) => names.get(id) ?? '?';
  const mine = useLoad(useCallback(() => loadMyEntries(gameId, night.night, userId), [gameId, night.night, userId]));
  const players = [...night.summary.players].sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)));

  return (
    <div className="flex flex-col gap-6">
      <Note title={`☀️ ${morningHeadline(night.night, night.summary)}`}>
        {mine.error ? (
          <LoadError onRetry={mine.reload} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-heading">O teu resultado</p>
            {mine.data?.length === 0 && <p>Nada a registar.</p>}
            {myResultLines(mine.data ?? [], nameOf).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}
      </Note>

      {caughtHeadline(night.summary, nameOf) && <p className="font-heading text-danger">{caughtHeadline(night.summary, nameOf)}</p>}

      <ul className="flex flex-col gap-3">
        {players.map((s) => (
          <li key={s.playerId} className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
            <p className="font-heading">
              {s.location === 'HOME' ? '🪟' : '🌑'} {nameOf(s.playerId)}{' '}
              <span className="font-base text-sm">{s.location === 'HOME' ? 'em casa' : 'fora'}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
