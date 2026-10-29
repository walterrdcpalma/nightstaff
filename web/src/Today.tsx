import { useCallback, useEffect, useState } from 'react';
import { ACTION_TYPES, QUOTAS, lisbonDate, previousTarget, remainingQuota, validateAction } from '../../engine/index.ts';
import type { Action, ActionType, GameState } from '../../engine/index.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { loadEnrolled, loadGames, loadMyActions, loadNames, loadNights, loadRoom, loadRoomPlayers } from '@/lib/data';
import type { Player, Room } from '@/lib/data';
import { roomErrorText } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import {
  ACTION_NAMES,
  BLOCKED_TARGET_TEXT,
  choiceText,
  errorText,
  formatCountdown,
  nextLisbonMidnight,
  targetOptions,
  botsPhase,
  todayPhase,
} from '@/lib/today';
import type { GameStatus } from '@/lib/today';
import { Lobby } from './Lobby.tsx';
import { LoadError, Note, useLoad } from './Note.tsx';

interface Game {
  id: number;
  start_date: string;
  status: GameStatus;
}
interface Data {
  room: Room | null;
  /** Jogadores da sala, por ordem de entrada (para o lobby). */
  roomPlayers: Player[];
  /** Partida mais recente da sala que joguei. */
  game: Game | null;
  /** Jogadores dessa partida, por nome. */
  players: Player[];
  /** As minhas ações nessa partida (a RLS só mostra as minhas). */
  mine: Awaited<ReturnType<typeof loadMyActions>>;
  /** Noites resolvidas: numa sala contra bots, a noite aberta é a seguinte. */
  resolvedNights: number;
}

/** Hora atual, atualizada a cada segundo (para a contagem). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

async function load(roomId: number): Promise<Data> {
  const [room, roomPlayers, games, names] = await Promise.all([
    loadRoom(roomId),
    loadRoomPlayers(roomId),
    loadGames(roomId),
    loadNames(),
  ]);
  const game = games[0] ?? null;
  if (!game) return { room, roomPlayers, game: null, players: [], mine: [], resolvedNights: 0 };
  const [enrolled, mine, nights] = await Promise.all([loadEnrolled(game.id), loadMyActions(game.id), loadNights(game.id)]);
  const players = enrolled.map((id) => ({ id, name: names.get(id) ?? '?' })).sort((a, b) => a.name.localeCompare(b.name));
  return { room, roomPlayers, game, players, mine, resolvedNights: nights.length };
}

/** Hoje numa sala: o lobby, a escolha da noite ou a resolução (com Reiniciar para o admin). */
export default function Today(props: { userId: string; roomId: number; onLeft: () => void }) {
  const { userId, roomId } = props;
  const now = useNow();
  // `today` nas dependências: ao passar a meia-noite de Lisboa, volta a ler (fase nova).
  const today = lisbonDate(now);
  const { data, error, reload } = useLoad(useCallback(() => load(roomId), [roomId, today]));

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <p>A acender as luzes da rua…</p>;
  if (!data.room) return <Note title="Porta fechada">Já não estás nesta sala.</Note>;
  if (data.room.status === 'lobby') {
    return <Lobby room={data.room} players={data.roomPlayers} userId={userId} onChange={reload} onLeft={props.onLeft} />;
  }
  if (!data.game) return <Waking onRetry={reload} />;

  const bots = data.room.kind === 'bots';
  const phase = bots ? botsPhase(data.game.status, data.resolvedNights) : todayPhase(data.game.start_date, data.game.status, today);
  const enrolled = data.players.some((p) => p.id === userId);
  const countdown = formatCountdown(nextLisbonMidnight(now).getTime() - now.getTime());

  switch (phase.kind) {
    case 'NIGHT':
      if (!enrolled) {
        return <Note title={`Noite ${phase.night} de 9`}>Esta partida começou sem ti.</Note>;
      }
      // A `key` repõe a escolha quando muda a noite sem desmontar o ecrã.
      return (
        <Night
          key={phase.night}
          data={data}
          night={phase.night}
          userId={userId}
          countdown={bots ? null : countdown}
          onChange={reload}
        />
      );
    case 'RESULTS':
      return <Results room={data.room} userId={userId} onChange={reload} />;
    case 'WAKING':
      return <Waking onRetry={reload} />;
  }
}

function Waking({ onRetry }: { onRetry: () => void }) {
  return (
    <Note title="O bairro está a acordar…">
      <p className="mb-4">O turno está a mudar. Daqui a nada abre o dia.</p>
      <Button variant="neutral" onClick={onRetry}>
        Espreitar outra vez
      </Button>
    </Note>
  );
}

/** Partida acabada. O admin pode reiniciar a sala: volta ao lobby, com o mesmo código (RULES.md §1.1). */
function Results(props: { room: Room; userId: string; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = props.room.admin_id === props.userId;

  async function restart() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc('restart_room', { p_room_id: props.room.id });
    setBusy(false);
    if (error) setError(roomErrorText(error.message));
    props.onChange();
  }

  return (
    <Note title="🏆 Dia de resolução">
      <div className="flex flex-col gap-4">
        <p>A partida acabou. Vê o Funcionário do Mês nos Pontos.</p>
        {isAdmin ? (
          <Button onClick={restart} disabled={busy}>
            {props.room.kind === 'bots' ? '🔁 Jogar outra vez contra os mesmos bots' : '🔁 Reiniciar a sala'}
          </Button>
        ) : (
          <p className="text-sm">Se o admin reiniciar a sala, volta ao lobby com o mesmo código.</p>
        )}
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Note>
  );
}

function Deadline({ countdown }: { countdown: string }) {
  return (
    <p>
      Fecha às 23:59. Faltam <span className="font-heading text-main tabular-nums">{countdown}</span>.
    </p>
  );
}

/** ⏭️ Passar o dia (RULES.md §1.2): os bots escolhem ao calhas e a noite resolve-se já, na `resolve-night`. */
function PassDay(props: { roomId: number; night: number; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pass() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.functions.invoke('resolve-night', { body: { room_id: props.roomId, night: props.night } });
    setBusy(false);
    if (error) {
      const body = await (error as { context?: Response }).context?.json().catch(() => null);
      setError(roomErrorText(body?.error ?? ''));
    }
    props.onChange();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" variant="neutral" onClick={pass} disabled={busy}>
        {busy ? 'A passar a noite…' : '⏭️ Passar o dia'}
      </Button>
      <p className="text-sm">Os bots escolhem e a noite resolve-se já. Se não confirmaste nada, ficas de 🏠 Folga.</p>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

function Night(props: { data: Data; night: number; userId: string; countdown: string | null; onChange: () => void }) {
  const { data, night, userId } = props;
  const chosen = data.mine.find((a) => a.night === night);
  const [type, setType] = useState<ActionType>(chosen?.type ?? 'STAY');
  const [targetId, setTargetId] = useState<string | null>(chosen?.target_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const state: GameState = {
    players: data.players.map((p) => p.id),
    night,
    pastActions: data.mine
      .filter((a) => a.night < night)
      .map((a) => ({ night: a.night, playerId: userId, type: a.type, targetId: a.target_id })),
  };
  const quota = remainingQuota(state, userId);
  const nameOf = (id: string | null) => data.players.find((p) => p.id === id)?.name;
  const needsTarget = type === 'ATTACK' || type === 'BOMB';
  // Não se pode ir à mesma casa duas noites seguidas (RULES.md §2): o alvo de ontem fica bloqueado.
  const targets = targetOptions(data.players, userId, previousTarget(state, userId));

  async function save() {
    const action: Action = { playerId: userId, type, targetId: needsTarget ? targetId : null };
    const check = validateAction(state, action);
    if (!check.ok) return setError(errorText(check.error));
    setError(null);
    setSaving(true);
    const { error } = await supabase
      .from('actions')
      .upsert(
        { game_id: data.game!.id, night, player_id: userId, type, target_id: action.targetId },
        { onConflict: 'game_id,night,player_id' },
      );
    setSaving(false);
    if (error) setError(errorText(error.message));
    props.onChange();
  }

  return (
    <div className="flex flex-col gap-6">
      <Note title={`🌙 Noite ${night} de 9`}>
        <div className="flex flex-col gap-2">
          {props.countdown !== null ? (
            <Deadline countdown={props.countdown} />
          ) : (
            <p>O tempo só passa quando carregares em ⏭️ Passar o dia.</p>
          )}
          <p>
            Esta noite:{' '}
            <strong>{chosen ? choiceText(chosen.type, nameOf(chosen.target_id)) : 'ainda nada. Se não escolheres, ficas de 🏠 Folga.'}</strong>
          </p>
          {night === 9 && <p className="text-main">Última noite: tudo conta a dobrar.</p>}
        </div>
      </Note>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">O que fazes esta noite?</h2>
        {ACTION_TYPES.map((t) => {
          const limit = t === 'STAY' ? null : QUOTAS[t];
          const left = t === 'STAY' ? null : quota[t];
          return (
            <Button
              key={t}
              variant={type === t ? 'default' : 'neutral'}
              disabled={left === 0}
              onClick={() => setType(t)}
              className="h-12 justify-between"
            >
              <span>{ACTION_NAMES[t]}</span>
              <Badge variant="neutral">{left === null ? '∞' : `${left}/${limit}`}</Badge>
            </Button>
          );
        })}
      </section>

      {needsTarget && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg">A casa de quem?</h2>
          <div className="grid grid-cols-2 gap-3">
            {targets.map((p) => (
              <Button
                key={p.id}
                variant={targetId === p.id ? 'default' : 'neutral'}
                disabled={p.blocked}
                onClick={() => setTargetId(p.id)}
                className="h-auto min-h-10 flex-col whitespace-normal py-2"
              >
                <span>{p.blocked ? `🚫 ${p.name}` : p.name}</span>
                {p.blocked && <span className="text-xs font-base">{BLOCKED_TARGET_TEXT}</span>}
              </Button>
            ))}
          </div>
        </section>
      )}

      <Button size="lg" onClick={save} disabled={saving || (needsTarget && !targetId)}>
        {saving ? 'A guardar…' : `Confirmar: ${choiceText(type, needsTarget ? nameOf(targetId) : undefined)}`}
      </Button>
      {error && <p className="text-danger">{error}</p>}
      {data.room?.kind === 'bots' && <PassDay roomId={data.room.id} night={night} onChange={props.onChange} />}
    </div>
  );
}
