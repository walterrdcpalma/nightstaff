import { useCallback, useEffect, useState } from 'react';
import { ACTION_TYPES, QUOTAS, lisbonDate, previousTarget, remainingQuota, validateAction } from '../../engine/index.ts';
import type { Action, ActionType, GameState } from '../../engine/index.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  ACTION_NAMES,
  BLOCKED_TARGET_TEXT,
  choiceText,
  errorText,
  formatCountdown,
  nextLisbonMidnight,
  targetOptions,
  todayPhase,
} from '@/lib/today';
import type { GameStatus } from '@/lib/today';
import { LoadError, Note, useLoad } from './Note.tsx';

interface Game {
  id: number;
  start_date: string;
  status: GameStatus;
}
interface Player {
  id: string;
  name: string;
}
interface MyAction {
  night: number;
  type: ActionType;
  target_id: string | null;
}
interface Data {
  me: Player | null;
  game: Game | null;
  players: Player[];
  mine: MyAction[];
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

/** Um erro numa leitura lança, para o ecrã não confundir uma falha de rede com "não há ciclo". */
function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function load(userId: string): Promise<Data> {
  const me = ok(await supabase.from('players').select('id, name').eq('id', userId).maybeSingle());
  const game = ok(
    await supabase.from('games').select('id, start_date, status').order('id', { ascending: false }).limit(1).maybeSingle(),
  );
  if (!game) return { me, game: null, players: [], mine: [] };
  const enrolled = ok(await supabase.from('game_players').select('players(id, name)').eq('game_id', game.id)) ?? [];
  // RLS: só vêm as minhas ações.
  const mine = ok(await supabase.from('actions').select('night, type, target_id').eq('game_id', game.id)) ?? [];
  const players = enrolled.map((r) => r.players as unknown as Player).sort((a, b) => a.name.localeCompare(b.name));
  return { me, game, players, mine };
}

export default function Today({ userId }: { userId: string }) {
  const now = useNow();
  // `today` nas dependências: ao passar a meia-noite de Lisboa, volta a ler (fase nova).
  const today = lisbonDate(now);
  const { data, error, reload } = useLoad(useCallback(() => load(userId), [userId, today]));

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <p>A acender as luzes da rua…</p>;
  if (!data.me) return <Note title="Ainda não és do bairro">Pede ao Walter para te pôr na lista de jogadores.</Note>;
  if (!data.game) return <Note title="Rua sossegada">Ainda não há nenhum ciclo. Volta mais logo.</Note>;

  const phase = todayPhase(data.game.start_date, data.game.status, today);
  const enrolled = data.players.some((p) => p.id === userId);
  const countdown = formatCountdown(nextLisbonMidnight(now).getTime() - now.getTime());

  switch (phase.kind) {
    case 'PREP':
      return <Prep game={data.game} players={data.players} enrolled={enrolled} userId={userId} countdown={countdown} onChange={reload} />;
    case 'NIGHT':
      if (!enrolled) {
        return <Note title={`Noite ${phase.night} de 9`}>Este ciclo começou sem ti. Volta no próximo dia de preparação.</Note>;
      }
      // A `key` repõe a escolha quando muda a noite sem desmontar o ecrã.
      return <Night key={phase.night} data={data} night={phase.night} userId={userId} countdown={countdown} onChange={reload} />;
    case 'RESULTS':
      return <Note title="🏆 Dia de resolução">Não há ações hoje. Chegou a hora de conhecer o Funcionário do Mês.</Note>;
    case 'WAKING':
      return (
        <Note title="O bairro está a acordar…">
          <p className="mb-4">O turno está a mudar. Daqui a nada abre o dia.</p>
          <Button variant="neutral" onClick={reload}>
            Espreitar outra vez
          </Button>
        </Note>
      );
  }
}

function Deadline({ countdown }: { countdown: string }) {
  return (
    <p>
      Fecha às 23:59. Faltam <span className="font-heading text-main tabular-nums">{countdown}</span>.
    </p>
  );
}

function Prep(props: { game: Game; players: Player[]; enrolled: boolean; userId: string; countdown: string; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const { error } = props.enrolled
      ? await supabase.from('game_players').delete().eq('game_id', props.game.id).eq('player_id', props.userId)
      : await supabase.from('game_players').insert({ game_id: props.game.id, player_id: props.userId });
    if (error) setError(errorText(error.message));
    props.onChange();
  }

  return (
    <Note title="📝 Dia de preparação">
      <div className="flex flex-col gap-4">
        <p>Quem entra no turno deste ciclo? São precisos pelo menos 3.</p>
        <Deadline countdown={props.countdown} />
        <p>
          Inscritos ({props.players.length}): {props.players.map((p) => p.name).join(', ') || 'ninguém, por agora'}.
        </p>
        <Button onClick={toggle} variant={props.enrolled ? 'neutral' : 'default'}>
          {props.enrolled ? 'Sair do ciclo' : 'Entrar no ciclo'}
        </Button>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Note>
  );
}

function Night(props: { data: Data; night: number; userId: string; countdown: string; onChange: () => void }) {
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
          <Deadline countdown={props.countdown} />
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
    </div>
  );
}
