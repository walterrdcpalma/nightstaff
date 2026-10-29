import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadEnrolled, loadGames, loadNames, loadNights } from '@/lib/data';
import type { Game, ResolvedNight } from '@/lib/data';
import { historyGrid } from '@/lib/night';
import type { WindowLight } from '@/lib/night';
import { cn } from '@/lib/utils';
import { NightView } from './NightView.tsx';
import { LoadError, Note, useLoad } from './Note.tsx';

/** A partida atual da sala, com as noites já resolvidas. Só a atual se vê (RLS): as anteriores não. */
interface Current {
  game: Game;
  nights: ResolvedNight[];
  enrolled: string[];
  names: Map<string, string>;
}

/** `null` se a sala ainda não tem partida com noites resolvidas. */
async function loadCurrent(roomId: number): Promise<Current | null> {
  const [games, names] = await Promise.all([loadGames(roomId), loadNames()]);
  const game = games[0];
  if (!game) return null;
  const [nights, enrolled] = await Promise.all([loadNights(game.id), loadEnrolled(game.id)]);
  return nights.length > 0 ? { game, nights, enrolled, names } : null;
}

/**
 * Manhã: o meu relatório privado da noite e as manchetes públicas. Por omissão, a última noite resolvida;
 * as rondas anteriores desta partida continuam consultáveis, com as mesmas regras (RULES.md §4).
 */
export function Morning({ userId, roomId }: { userId: string; roomId: number }) {
  const current = useLoad(useCallback(() => loadCurrent(roomId), [roomId]));
  const [picked, setPicked] = useState<number | null>(null);

  if (current.error) return <LoadError onRetry={current.reload} />;
  if (current.data === undefined) return <p>A abrir as persianas…</p>;
  if (!current.data) return <Note title="Ainda é cedo">Ainda nenhuma noite foi resolvida. Volta amanhã de manhã.</Note>;

  const { game, nights, names } = current.data;
  const shown = nights.find((n) => n.night === picked) ?? nights[nights.length - 1];
  return (
    <div className="flex flex-col gap-4">
      {nights.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {nights.map((n) => (
            <Button key={n.night} size="sm" variant={n.night === shown.night ? 'default' : 'neutral'} onClick={() => setPicked(n.night)}>
              Noite {n.night}
            </Button>
          ))}
        </div>
      )}
      {/* A `key` recomeça a história ao mudar de noite. */}
      <NightView key={shown.night} gameId={game.id} night={shown} names={names} userId={userId} />
    </div>
  );
}

/** Bairro/Histórico da partida atual: só casa/fora. Uma casa por jogador e a janela de cada noite, nunca as ações (RULES.md §4). */
export function Neighborhood({ roomId }: { roomId: number }) {
  const current = useLoad(useCallback(() => loadCurrent(roomId), [roomId]));

  if (current.error) return <LoadError onRetry={current.reload} />;
  if (current.data === undefined) return <p>A percorrer a rua…</p>;
  if (!current.data) return <Note title="Rua por estrear">Ainda nenhuma noite foi resolvida.</Note>;

  const { nights, enrolled, names } = current.data;
  const nameOf = (id: string) => names.get(id) ?? '?';
  const grid = [...historyGrid(enrolled, nights)].sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="flex flex-col gap-6">
      <Note title="🏘️ O bairro">
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-sm">
          <colgroup>
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i} className={cn('font-heading', !nights.some((n) => n.night === i + 1) && 'opacity-40')}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(([id, windows]) => (
              <tr key={id}>
                <td className="max-w-16 truncate pr-1 font-heading">{nameOf(id)}</td>
                {windows.map((w, i) => (
                  <td key={i}>
                    <WindowCell window={w} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs">🟨 janela acesa: em casa · ⬛ apagada: fora. O que cada um fez fica entre ele e a noite.</p>
      </Note>
    </div>
  );
}

function WindowCell({ window }: { window: WindowLight }) {
  const label = window === 'HOME' ? 'em casa' : window === 'AWAY' ? 'fora' : 'por resolver';
  return (
    <div
      title={label}
      aria-label={label}
      className={cn(
        'mx-auto size-5 rounded-sm border-2 border-border',
        window === 'HOME' && 'bg-main shadow-[0_0_8px_var(--main)]',
        window === 'AWAY' && 'bg-background',
        window === null && 'border-dashed opacity-30',
      )}
    />
  );
}
