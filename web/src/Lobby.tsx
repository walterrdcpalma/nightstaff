import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Player, Room } from '@/lib/data';
import { canStart, roomErrorText } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import { MIN_PLAYERS } from '../../engine/index.ts';
import { Note } from './Note.tsx';

/**
 * Lobby (RULES.md §1.1): o código para partilhar e quem já entrou. O admin carrega em Começar (com 3 ou mais),
 * e a noite 1 abre logo. Qualquer um pode sair; se sair o admin, passa a admin quem entrou há mais tempo.
 */
export function Lobby(props: { room: Room; players: Player[]; userId: string; onChange: () => void; onLeft: () => void }) {
  const { room, players, userId } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isAdmin = room.admin_id === userId;
  const admin = players.find((p) => p.id === room.admin_id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
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
              {p.id === room.admin_id && <Badge>👑 admin</Badge>}
            </li>
          ))}
        </ul>
      </Note>

      {isAdmin ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => run('start_room')} disabled={busy || !canStart(players.length)}>
            ▶️ Começar
          </Button>
          <p className="text-sm">
            {canStart(players.length)
              ? 'A noite 1 abre logo e fecha às 23:59 de hoje. Depois, ninguém entra nem sai.'
              : `São precisos pelo menos ${MIN_PLAYERS} jogadores.`}
          </p>
        </div>
      ) : (
        <p>À espera que {admin?.name ?? 'o admin'} carregue em Começar.</p>
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
