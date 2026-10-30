import { useCallback, useState } from 'react';
import { NIGHTS } from '../../engine/index.ts';
import { Button } from '@/components/ui/button';
import { loadGames, loadNames, loadNights } from '@/lib/data';
import type { Game, ResolvedNight } from '@/lib/data';
import { streetHouses } from '@/lib/street';
import { NightView } from './NightView.tsx';
import { Street } from './Street.tsx';
import { LoadError, Note, useLoad } from './Note.tsx';

/** A partida atual da sala, com as noites já resolvidas. Só a atual se vê (RLS): as anteriores não. */
interface Current {
  game: Game;
  nights: ResolvedNight[];
  names: Map<string, string>;
}

/** `null` se a sala ainda não tem partida com noites resolvidas. */
async function loadCurrent(roomId: number): Promise<Current | null> {
  const [games, names] = await Promise.all([loadGames(roomId), loadNames()]);
  const game = games[0];
  if (!game) return null;
  const nights = await loadNights(game.id);
  return nights.length > 0 ? { game, nights, names } : null;
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

/**
 * Bairro/Histórico da partida atual, como uma rua à noite (T19): uma casa por jogador, com a janela acesa se estava
 * em casa e apagada se estava fora, e a sirene de quem foi apanhado. Uma noite de cada vez. Nunca as ações (RULES.md §4).
 */
export function Neighborhood({ roomId }: { roomId: number }) {
  const current = useLoad(useCallback(() => loadCurrent(roomId), [roomId]));
  const [picked, setPicked] = useState<number | null>(null);

  if (current.error) return <LoadError onRetry={current.reload} />;
  if (current.data === undefined) return <p>A percorrer a rua…</p>;
  if (!current.data) return <Note title="Rua por estrear">Ainda nenhuma noite foi resolvida.</Note>;

  const { nights, names } = current.data;
  const shown = nights.find((n) => n.night === picked) ?? nights[nights.length - 1];
  const houses = streetHouses(shown.summary, (id) => names.get(id) ?? '?');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: NIGHTS }, (_, i) => i + 1).map((n) => (
          <Button
            key={n}
            size="sm"
            variant={n === shown.night ? 'default' : 'neutral'}
            disabled={!nights.some((r) => r.night === n)}
            onClick={() => setPicked(n)}
          >
            {n}
          </Button>
        ))}
      </div>
      <Note title={`🏘️ O bairro na noite ${shown.night}`}>
        <Street houses={houses} night={shown.night} />
        <p className="mt-3 text-xs">
          Janela acesa: em casa · apagada, de cortina cruzada: fora · 🚨 a Segurança deu com essa pessoa. O que cada um fez
          fica entre cada um e a noite.
        </p>
      </Note>
    </div>
  );
}
