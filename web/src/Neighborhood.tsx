import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadEnrolled, loadGames, loadGamesWithNights, loadNames, loadNights } from '@/lib/data';
import type { Game, ResolvedNight } from '@/lib/data';
import { historyGrid } from '@/lib/night';
import type { WindowLight } from '@/lib/night';
import { cn } from '@/lib/utils';
import { NightView } from './NightView.tsx';
import { LoadError, Note, useLoad } from './Note.tsx';

interface GameNights {
  game: Game;
  nights: ResolvedNight[];
  enrolled: string[];
}

/** Partidas da sala com pelo menos uma noite resolvida, da mais recente para a mais antiga. */
async function loadSeasons(roomId: number): Promise<{ games: Game[]; names: Map<string, string> }> {
  const [games, names, withNights] = await Promise.all([loadGames(roomId), loadNames(), loadGamesWithNights()]);
  return { games: games.filter((g) => withNights.has(g.id)), names };
}

async function loadGameNights(game: Game): Promise<GameNights> {
  const [nights, enrolled] = await Promise.all([loadNights(game.id), loadEnrolled(game.id)]);
  return { game, nights, enrolled };
}

/** "Partida de 3/11". */
const gameLabel = (g: Game) => `Partida de ${Number(g.start_date.slice(8))}/${Number(g.start_date.slice(5, 7))}`;

/** Botões de escolha da partida, quando a sala tem mais do que uma com noites resolvidas (depois de Reiniciar). */
function GamePicker(props: { games: Game[]; current: number; onPick: (id: number) => void }) {
  if (props.games.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.games.map((g) => (
        <Button key={g.id} size="sm" variant={g.id === props.current ? 'default' : 'neutral'} onClick={() => props.onPick(g.id)}>
          {gameLabel(g)}
        </Button>
      ))}
    </div>
  );
}

/** Partida escolhida da sala (por omissão, a mais recente com noites) e as suas noites. */
function useGameNights(roomId: number) {
  const games = useLoad(useCallback(() => loadSeasons(roomId), [roomId]));
  const [gameId, setGameId] = useState<number | null>(null);
  const game = games.data?.games.find((g) => g.id === gameId) ?? games.data?.games[0];
  const nights = useLoad(useCallback(() => (game ? loadGameNights(game) : Promise.resolve(null)), [game]));
  return { games, nights, setGameId };
}

/**
 * Manhã: o meu relatório privado da noite e as manchetes públicas. Por omissão, a última noite resolvida;
 * as anteriores (e as partidas anteriores da sala) continuam consultáveis, com as mesmas regras (RULES.md §4).
 */
export function Morning({ userId, roomId }: { userId: string; roomId: number }) {
  const { games: seasons, nights: played, setGameId } = useGameNights(roomId);
  const [picked, setPicked] = useState<number | null>(null);

  if (seasons.error || played.error) return <LoadError onRetry={seasons.error ? seasons.reload : played.reload} />;
  if (!seasons.data || played.data === undefined) return <p>A abrir as persianas…</p>;
  if (!played.data) return <Note title="Ainda é cedo">Ainda nenhuma noite foi resolvida. Volta amanhã de manhã.</Note>;

  const { game, nights } = played.data;
  const shown = nights.find((n) => n.night === picked) ?? nights[nights.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <GamePicker
        games={seasons.data.games}
        current={game.id}
        onPick={(id) => {
          setGameId(id);
          setPicked(null);
        }}
      />
      {nights.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {nights.map((n) => (
            <Button key={n.night} size="sm" variant={n.night === shown.night ? 'default' : 'neutral'} onClick={() => setPicked(n.night)}>
              Noite {n.night}
            </Button>
          ))}
        </div>
      )}
      <NightView gameId={game.id} night={shown} names={seasons.data.names} userId={userId} />
    </div>
  );
}

/** Bairro/Histórico: só casa/fora. Uma casa por jogador e a janela de cada noite, nunca as ações (RULES.md §4). */
export function Neighborhood({ roomId }: { roomId: number }) {
  const { games: seasons, nights: played, setGameId } = useGameNights(roomId);

  if (seasons.error || played.error) return <LoadError onRetry={seasons.error ? seasons.reload : played.reload} />;
  if (!seasons.data || played.data === undefined) return <p>A percorrer a rua…</p>;
  if (!played.data) return <Note title="Rua por estrear">Ainda nenhuma noite foi resolvida.</Note>;

  const { game, nights, enrolled } = played.data;
  const nameOf = (id: string) => seasons.data!.names.get(id) ?? '?';
  const grid = [...historyGrid(enrolled, nights)].sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="flex flex-col gap-6">
      <GamePicker games={seasons.data.games} current={game.id} onPick={setGameId} />
      <Note title={`🏘️ O bairro · ${gameLabel(game)}`}>
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
