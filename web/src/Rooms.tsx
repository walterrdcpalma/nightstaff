import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadMyChoices, loadRooms, loadRunningGames } from '@/lib/data';
import { ROOM_STATUS_TEXT, codeError, needsMe, normalizeCode, openNight, roomErrorText, roomTodo, sortRooms } from '@/lib/rooms';
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
      const night = game ? openNight(game.start_date, today) : null;
      return {
        id: r.id,
        code: r.code,
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
                  <span className="font-heading text-lg tracking-widest">{r.code}</span>
                  <Badge variant="neutral">{ROOM_STATUS_TEXT[r.status]}</Badge>
                </span>
                <span className="text-sm">
                  {r.players} {r.players === 1 ? 'jogador' : 'jogadores'}
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
