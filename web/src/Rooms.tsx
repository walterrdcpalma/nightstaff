import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadMyChoices, loadRooms, loadRunningGames } from '@/lib/data';
import {
  BOTS_MAX,
  BOTS_MIN,
  ROOM_STATUS_TEXT,
  botsNight,
  codeError,
  needsMe,
  normalizeCode,
  openNight,
  roomErrorText,
  roomTodo,
  sortRooms,
} from '@/lib/rooms';
import type { RoomCard } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { lisbonDate } from '../../engine/index.ts';
import { LoadError, Note, useLoad } from './Note.tsx';

/** As minhas salas, com a noite aberta em cada uma e se já escolhi. */
async function load(userId: string, today: string): Promise<RoomCard[]> {
  const [rooms, running] = await Promise.all([loadRooms(), loadRunningGames()]);
  const choices = await loadMyChoices(running.map((g) => g.id));
  return sortRooms(
    rooms.map((r) => {
      const game = r.status === 'running' ? running.find((g) => g.room_id === r.id) : undefined;
      // Contra bots, o tempo só passa com ⏭️ Passar o dia; com pessoas, segue o relógio de Lisboa.
      const night = !game ? null : r.kind === 'bots' ? botsNight(game.resolvedNights) : openNight(game.start_date, today);
      return {
        id: r.id,
        code: r.code,
        kind: r.kind,
        status: r.status,
        isAdmin: r.admin_id === userId,
        players: r.players,
        night,
        chosen: !!game && choices.some((c) => c.game_id === game.id && c.night === night),
      };
    }),
  );
}

/** Ecrã inicial (RULES.md §1 v6): as minhas salas, criar uma e entrar com um código. */
export default function Rooms(props: { userId: string; onOpen: (roomId: number) => void }) {
  const today = lisbonDate(new Date());
  const { data, error, reload } = useLoad(useCallback(() => load(props.userId, today), [props.userId, today]));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl">As minhas salas</h2>
      {error ? (
        <LoadError onRetry={reload} />
      ) : !data ? (
        <p>A contar as portas…</p>
      ) : data.length === 0 ? (
        <Note title="Ainda sem turno">Cria uma sala e partilha o código, ou entra com o código que um amigo te deu.</Note>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => props.onOpen(r.id)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-base border-2 border-border bg-secondary-background p-3 text-left shadow-shadow',
                  needsMe(r) && 'border-main',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-heading text-lg tracking-widest">
                    {r.kind === 'bots' ? `🤖 ${r.code}` : r.code}
                  </span>
                  <Badge variant="neutral">{ROOM_STATUS_TEXT[r.status]}</Badge>
                </span>
                <span className="text-sm">
                  {r.kind === 'bots' ? `Tu contra ${r.players - 1} bots` : `${r.players} ${r.players === 1 ? 'jogador' : 'jogadores'}`}
                  {r.isAdmin && ' · és o admin'}
                </span>
                <span className={cn(needsMe(r) && 'font-heading text-main')}>{roomTodo(r)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CreateRoom onOpen={props.onOpen} />
      <JoinRoom onOpen={props.onOpen} />
      <CreateBotsRoom onOpen={props.onOpen} />
    </div>
  );
}

function CreateRoom({ onOpen }: { onOpen: (roomId: number) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('create_room');
    setBusy(false);
    if (error) return setError(roomErrorText(error.message));
    onOpen((data as { id: number }).id);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" onClick={create} disabled={busy}>
        ➕ Criar sala
      </Button>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

function JoinRoom({ onOpen }: { onOpen: (roomId: number) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: FormEvent) {
    e.preventDefault();
    const invalid = codeError(code);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('join_room', { p_code: normalizeCode(code) });
    setBusy(false);
    if (error) return setError(roomErrorText(error.message));
    onOpen(data as number);
  }

  return (
    <Note title="🔑 Entrar com código">
      <form onSubmit={join} className="flex flex-col gap-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="text-center font-heading text-lg tracking-widest uppercase"
        />
        <Button type="submit" variant="neutral" disabled={busy}>
          Entrar
        </Button>
        {error && <p className="text-danger">{error}</p>}
      </form>
    </Note>
  );
}

/** Sala contra bots (RULES.md §1.2): escolher quantos (2 a 11). Começa logo; ninguém mais entra. */
function CreateBotsRoom({ onOpen }: { onOpen: (roomId: number) => void }) {
  const [bots, setBots] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('create_bots_room', { p_bots: bots });
    setBusy(false);
    if (error) return setError(roomErrorText(error.message));
    onOpen((data as { id: number }).id);
  }

  return (
    <Note title="🤖 Jogar contra bots">
      <div className="flex flex-col gap-3">
        <p>Sozinho contra o resto do staff. O dia só passa quando carregas em ⏭️ Passar o dia.</p>
        <div className="flex items-center justify-between gap-2">
          <Button variant="neutral" size="sm" onClick={() => setBots(bots - 1)} disabled={bots <= BOTS_MIN} aria-label="Menos um bot">
            −
          </Button>
          <span className="font-heading text-lg">{bots} bots</span>
          <Button variant="neutral" size="sm" onClick={() => setBots(bots + 1)} disabled={bots >= BOTS_MAX} aria-label="Mais um bot">
            +
          </Button>
        </div>
        <Button onClick={create} disabled={busy}>
          Criar sala contra bots
        </Button>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Note>
  );
}
