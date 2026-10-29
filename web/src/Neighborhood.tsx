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

/** Botões de escolha do ciclo, quando há mais do que um com noites resolvidas. */
function CyclePicker(props: { cycles: Game[]; current: number; onPick: (id: number) => void }) {
  if (props.cycles.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.cycles.map((g) => (
        <Button key={g.id} size="sm" variant={g.id === props.current ? 'default' : 'neutral'} onClick={() => props.onPick(g.id)}>
          {cycleLabel(g)}
        </Button>
      ))}
    </div>
  );
}

/** Ciclo escolhido (por omissão, o mais recente com noites) e as suas noites. */
function useCycle() {
  const cycles = useLoad(useCallback(loadCycles, []));
  const [gameId, setGameId] = useState<number | null>(null);
  const game = cycles.data?.cycles.find((g) => g.id === gameId) ?? cycles.data?.cycles[0];
  const cycle = useLoad(useCallback(() => (game ? loadCycle(game) : Promise.resolve(null)), [game]));
  return { cycles, cycle, setGameId };
}

/**
 * Manhã: o meu relatório privado da noite e as manchetes públicas. Por omissão, a última noite resolvida;
 * as anteriores (e os ciclos anteriores) continuam consultáveis, com as mesmas regras (RULES.md §4).
 */
export function Morning({ userId }: { userId: string }) {
  const { cycles, cycle, setGameId } = useCycle();
  const [picked, setPicked] = useState<number | null>(null);

  if (cycles.error || cycle.error) return <LoadError onRetry={cycles.error ? cycles.reload : cycle.reload} />;
  if (!cycles.data || cycle.data === undefined) return <p>A abrir as persianas…</p>;
  if (!cycle.data) return <Note title="Ainda é cedo">Ainda nenhuma noite foi resolvida. Volta amanhã de manhã.</Note>;

  const { game, nights } = cycle.data;
  const shown = nights.find((n) => n.night === picked) ?? nights[nights.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <CyclePicker
        cycles={cycles.data.cycles}
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
      <NightView gameId={game.id} night={shown} names={cycles.data.names} userId={userId} />
    </div>
  );
}

/** Bairro/Histórico: só casa/fora. Uma casa por jogador e a janela de cada noite, nunca as ações (RULES.md §4). */
export function Neighborhood() {
  const { cycles, cycle, setGameId } = useCycle();

  if (cycles.error || cycle.error) return <LoadError onRetry={cycles.error ? cycles.reload : cycle.reload} />;
  if (!cycles.data || cycle.data === undefined) return <p>A percorrer a rua…</p>;
  if (!cycle.data) return <Note title="Rua por estrear">Ainda nenhuma noite foi resolvida.</Note>;

  const { game, nights, enrolled } = cycle.data;
  const nameOf = (id: string) => cycles.data!.names.get(id) ?? '?';
  const grid = [...historyGrid(enrolled, nights)].sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="flex flex-col gap-6">
      <CyclePicker cycles={cycles.data.cycles} current={game.id} onPick={setGameId} />
      <Note title={`🏘️ O bairro · ${cycleLabel(game)}`}>
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
