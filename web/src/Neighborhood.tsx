import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadEnrolled, loadGames, loadGamesWithNights, loadNames, loadNights } from '@/lib/data';
import type { Game, ResolvedNight } from '@/lib/data';
import { historyGrid } from '@/lib/night';
import type { WindowLight } from '@/lib/night';
import { cn } from '@/lib/utils';
import { NightView } from './NightView.tsx';
import { LoadError, Note, useLoad } from './Note.tsx';

interface Cycle {
  game: Game;
  nights: ResolvedNight[];
  enrolled: string[];
}

/** Ciclos com pelo menos uma noite resolvida, do mais recente para o mais antigo. */
async function loadCycles(): Promise<{ cycles: Game[]; names: Map<string, string> }> {
  const [games, names, withNights] = await Promise.all([loadGames(), loadNames(), loadGamesWithNights()]);
  return { cycles: games.filter((g) => withNights.has(g.id)), names };
}

async function loadCycle(game: Game): Promise<Cycle> {
  const [nights, enrolled] = await Promise.all([loadNights(game.id), loadEnrolled(game.id)]);
  return { game, nights, enrolled };
}

/** "Ciclo de 3/11". */
const cycleLabel = (g: Game) => `Ciclo de ${Number(g.start_date.slice(8))}/${Number(g.start_date.slice(5, 7))}`;

/** Manhã: o resumo da última noite resolvida. */
export function Morning({ userId }: { userId: string }) {
  const { data, error, reload } = useLoad(useCallback(loadCycles, []));
  const latest = data?.cycles[0];
  const cycle = useLoad(useCallback(() => (latest ? loadCycle(latest) : Promise.resolve(null)), [latest]));

  if (error || cycle.error) return <LoadError onRetry={error ? reload : cycle.reload} />;
  if (!data || cycle.data === undefined) return <p>A abrir as persianas…</p>;
  if (!cycle.data) return <Note title="Ainda é cedo">Ainda nenhuma noite foi resolvida. Volta amanhã de manhã.</Note>;
  const last = cycle.data.nights[cycle.data.nights.length - 1];
  return <NightView gameId={cycle.data.game.id} night={last} names={data.names} userId={userId} />;
}

/** Bairro/Histórico: uma casa por jogador e a janela de cada noite; toca numa noite para ver o resumo. */
export function Neighborhood({ userId }: { userId: string }) {
  const { data, error, reload } = useLoad(useCallback(loadCycles, []));
  const [gameId, setGameId] = useState<number | null>(null);
  const game = data?.cycles.find((g) => g.id === gameId) ?? data?.cycles[0];
  const cycle = useLoad(useCallback(() => (game ? loadCycle(game) : Promise.resolve(null)), [game]));
  const [picked, setPicked] = useState<number | null>(null);

  if (error || cycle.error) return <LoadError onRetry={error ? reload : cycle.reload} />;
  if (!data || cycle.data === undefined) return <p>A percorrer a rua…</p>;
  if (!cycle.data) return <Note title="Rua por estrear">Ainda nenhuma noite foi resolvida.</Note>;

  const { nights, enrolled } = cycle.data;
  const nameOf = (id: string) => data.names.get(id) ?? '?';
  const grid = [...historyGrid(enrolled, nights)].sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));
  const shown = nights.find((n) => n.night === picked) ?? nights[nights.length - 1];

  return (
    <div className="flex flex-col gap-6">
      {data.cycles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.cycles.map((g) => (
            <Button
              key={g.id}
              size="sm"
              variant={g.id === cycle.data!.game.id ? 'default' : 'neutral'}
              onClick={() => {
                setGameId(g.id);
                setPicked(null);
              }}
            >
              {cycleLabel(g)}
            </Button>
          ))}
        </div>
      )}

      <Note title={`🏘️ O bairro · ${cycleLabel(cycle.data.game)}`}>
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-sm">
          <colgroup>
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 9 }, (_, i) => {
                const resolved = nights.some((n) => n.night === i + 1);
                return (
                  <th key={i}>
                    <button
                      disabled={!resolved}
                      onClick={() => setPicked(i + 1)}
                      className={cn('w-full font-heading', shown.night === i + 1 && 'text-main', !resolved && 'opacity-40')}
                    >
                      {i + 1}
                    </button>
                  </th>
                );
              })}
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
        <p className="mt-3 text-xs">🟨 janela acesa: em casa · ⬛ apagada: fora</p>
      </Note>

      <NightView gameId={cycle.data.game.id} night={shown} names={data.names} userId={userId} />
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
