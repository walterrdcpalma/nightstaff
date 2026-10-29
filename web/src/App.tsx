import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { loadMe } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import Login from './Login.tsx';
import NameForm from './NameForm.tsx';
import { Morning, Neighborhood } from './Neighborhood.tsx';
import { LoadError, useLoad } from './Note.tsx';
import Points from './Points.tsx';
import Rooms from './Rooms.tsx';
import Today from './Today.tsx';

const TABS = { today: '🌙 Hoje', morning: '☀️ Manhã', neighborhood: '🏘️ Bairro', points: '💰 Pontos' } as const;
type Tab = keyof typeof TABS;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl text-main">Night Staff</h1>
        {session && (
          <Button variant="neutral" size="sm" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
        )}
      </header>
      {session === undefined ? null : session ? <SignedIn key={session.user.id} userId={session.user.id} /> : <Login />}
    </main>
  );
}

/** Com sessão: primeiro o nome (primeiro login), depois as salas; dentro de uma sala, as abas só dessa sala. */
function SignedIn({ userId }: { userId: string }) {
  const me = useLoad(useCallback(() => loadMe(userId), [userId]));
  const [roomId, setRoomId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('today');

  if (me.error) return <LoadError onRetry={me.reload} />;
  if (me.data === undefined) return <p>A acender as luzes da rua…</p>;
  if (me.data === null) return <NameForm userId={userId} onDone={me.reload} />;
  if (roomId === null) {
    return (
      <Rooms
        userId={userId}
        onOpen={(id) => {
          setRoomId(id);
          setTab('today');
        }}
      />
    );
  }

  return (
    <>
      <Button variant="neutral" size="sm" className="self-start" onClick={() => setRoomId(null)}>
        ← As minhas salas
      </Button>
      <nav className="grid grid-cols-2 gap-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? 'default' : 'neutral'} onClick={() => setTab(t)} className="px-1">
            {TABS[t]}
          </Button>
        ))}
      </nav>
      {tab === 'today' && <Today userId={userId} roomId={roomId} onLeft={() => setRoomId(null)} />}
      {tab === 'morning' && <Morning userId={userId} roomId={roomId} />}
      {tab === 'neighborhood' && <Neighborhood roomId={roomId} />}
      {tab === 'points' && <Points userId={userId} roomId={roomId} />}
    </>
  );
}
