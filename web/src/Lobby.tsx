import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Player, Room } from '@/lib/data';
import { CONTEXT_HELP } from '@/lib/help';
import { canKick, canStart, kickWarning, missingPlayersText, roomErrorText } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import { HelpLink } from './HelpLink.tsx';
import { Note } from './Note.tsx';

/**
 * Lobby (RULES.md §1.1): o código para partilhar e quem já entrou. O admin carrega em Começar (com 3 ou mais),
 * e a noite 1 abre logo. Qualquer um pode sair; se sair o admin, passa a admin quem entrou há mais tempo. O admin pode
 * expulsar os outros (v9), com confirmação; quem sai assim pode voltar a entrar com o código.
 */
export function Lobby(props: { room: Room; players: Player[]; userId: string; onChange: () => void; onLeft: () => void }) {
  const { room, players, userId } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [kicking, setKicking] = useState<Player | null>(null);
  const isAdmin = room.admin_id === userId;
  const admin = players.find((p) => p.id === room.admin_id);
  const missing = missingPlayersText(players.length);

  async function copy() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não deu para copiar. Seleciona o código à mão.');
    }
  }

  async function run(fn: 'start_room' | 'leave_room') {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_room_id: room.id });
    setBusy(false);
    if (error) {
      setError(roomErrorText(error.message));
      props.onChange();
    } else if (fn === 'leave_room') {
      props.onLeft();
    } else {
      props.onChange();
    }
  }

  async function kick(player: Player) {
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.rpc('kick_player', { p_room_id: room.id, p_player_id: player.id });
      if (error) setError(roomErrorText(error.message));
    } catch {
      setError(roomErrorText(''));
    } finally {
      setBusy(false);
      setKicking(null);
      props.onChange();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Note title="📝 Lobby">
        <div className="flex flex-col gap-4">
          <p>Partilha o código com quem vai fazer o turno contigo.</p>
          <p className="select-all text-center font-heading text-5xl tracking-[0.2em] text-main">{room.code}</p>
          <Button variant="neutral" onClick={copy}>
            {copied ? '✅ Copiado' : '📋 Copiar o código'}
          </Button>
        </div>
      </Note>

      <Note title={`👥 No lobby (${players.length})`}>
        <ul className="flex flex-col gap-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-base border-2 border-border p-2">
              <span className="font-heading">
                {p.name}
                {p.id === userId && ' (tu)'}
              </span>
              <span className="flex items-center gap-2">
                {p.id === room.admin_id && <Badge>👑 admin</Badge>}
                {canKick(room, userId, p.id) && (
                  <Button size="sm" variant="neutral" onClick={() => setKicking(p)} disabled={busy || kicking !== null}>
                    Expulsar
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {kicking && (
          <div className="mt-4 flex flex-col gap-3 rounded-base border-2 border-border p-3">
            <p>{kickWarning(kicking.name)}</p>
            <div className="flex flex-wrap gap-3">
              <Button className="bg-danger" onClick={() => kick(kicking)} disabled={busy}>
                {busy ? 'A expulsar…' : 'Sim, expulsar'}
              </Button>
              <Button variant="neutral" onClick={() => setKicking(null)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Note>

      {isAdmin ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => run('start_room')} disabled={busy || !canStart(players.length)}>
            ▶️ Começar
          </Button>
          <p className="flex items-center gap-2 text-sm">
            {missing ?? 'A noite 1 abre logo e fecha às 23:59 de hoje. Depois, ninguém entra nem sai.'}
            {missing && <HelpLink anchor={CONTEXT_HELP.lobby} label="porque é que o Começar está desligado" />}
          </p>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2">
          À espera que {admin?.name ?? 'o admin'} carregue em Começar.{missing && ` ${missing}`}
          <HelpLink anchor={CONTEXT_HELP.lobby} label="quando se pode começar" />
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="neutral" onClick={props.onChange} disabled={busy}>
          Espreitar outra vez
        </Button>
        <Button variant="neutral" onClick={() => run('leave_room')} disabled={busy}>
          Sair da sala
        </Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
