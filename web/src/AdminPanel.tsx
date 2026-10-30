import { useCallback, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminDates, groupAdminRooms, ROOM_KIND_TEXT } from '@/lib/admin';
import type { AdminRoom } from '@/lib/admin';
import { loadAdminRooms } from '@/lib/data';
import { ROOM_STATUS_TEXT } from '@/lib/rooms';
import { lisbonDate } from '../../engine/index.ts';
import { LoadError, Note, useLoad } from './Note.tsx';

/**
 * 🛠️ Painel da app (T23, RULES.md §7 v10): só para o admin da app, por cima do ecrã atual, como a Ajuda.
 * Todas as salas, em Correntes e Fechadas, só com metadados. Só lê: não altera nada.
 */
export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const today = lisbonDate(new Date());
  const { data, error, reload } = useLoad(useCallback(() => loadAdminRooms(), []));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let content: React.ReactNode;
  if (error) content = <LoadError onRetry={reload} />;
  else if (data === undefined) content = <p>A contar as salas…</p>;
  else {
    const { current, closed } = groupAdminRooms(data, today);
    content = (
      <>
        <RoomList title={`🌙 Correntes (${current.length})`} rooms={current} empty="Nenhuma sala em lobby ou a decorrer." />
        <RoomList title={`🏁 Fechadas (${closed.length})`} rooms={closed} empty="Nenhuma sala acabada." />
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Painel da app" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background py-2">
          <h1 className="text-2xl text-main">🛠️ Painel</h1>
          <Button variant="neutral" size="sm" onClick={onClose} autoFocus>
            Fechar
          </Button>
        </header>
        <p className="text-sm">Todas as salas do bairro, só por fora: quem lá está e em que noite vão. O que cada um fez fica lá dentro.</p>
        {content}
      </div>
    </div>
  );
}

function RoomList({ title, rooms, empty }: { title: string; rooms: AdminRoom[]; empty: string }) {
  return (
    <Note title={title}>
      {rooms.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rooms.map((r) => (
            <li key={r.room_id} className="flex flex-col gap-1 rounded-base border-2 border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-lg tracking-widest">{r.code}</span>
                <Badge variant="neutral">{ROOM_KIND_TEXT[r.kind]}</Badge>
                <Badge variant="neutral">{ROOM_STATUS_TEXT[r.status]}</Badge>
                {r.night !== null && <Badge>Noite {r.night}</Badge>}
              </div>
              <p className="text-sm">👑 {r.admin_name}</p>
              <p className="text-sm">
                👥 {r.players.length}: {r.players.join(', ')}
              </p>
              <p className="text-xs">{adminDates(r).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </Note>
  );
}
