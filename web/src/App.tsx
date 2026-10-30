import { Fragment, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { loadMe } from '@/lib/data';
import { nameButtonText } from '@/lib/rooms';
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
      {session === undefined ? (
        <Header />
      ) : session ? (
        <SignedIn key={session.user.id} userId={session.user.id} />
      ) : (
        <>
          <Header />
          <Login />
        </>
      )}
    </main>
  );
}

/** Cabeçalho da app; com sessão, à direita, o meu nome e Sair. */
function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2">
      <h1 className="text-2xl text-main">Night Staff</h1>
      {children && <div className="flex min-w-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/**
 * Com sessão: primeiro o nome (primeiro login), depois as salas; dentro de uma sala, as abas só dessa sala.
 * No cabeçalho, o meu nome abre o formulário para o mudar (T15).
 */
function SignedIn({ userId }: { userId: string }) {
  const me = useLoad(useCallback(() => loadMe(userId), [userId]));
  const [roomId, setRoomId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [editingName, setEditingName] = useState(false);
  // Muda ao guardar o nome: os ecrãs voltam a ler, e o nome novo aparece logo nas salas, manchetes e ranking.
  const [nameVersion, setNameVersion] = useState(0);

  let content: React.ReactNode;
  if (me.error) content = <LoadError onRetry={me.reload} />;
  else if (me.data === undefined) content = <p>A acender as luzes da rua…</p>;
  else if (me.data === null) content = <NameForm userId={userId} onDone={me.reload} />;
  else if (editingName) {
    content = (
      <NameForm
        userId={userId}
        current={me.data.name}
        onCancel={() => setEditingName(false)}
        onDone={() => {
          setEditingName(false);
          setNameVersion((v) => v + 1);
          me.reload();
        }}
      />
    );
  } else if (roomId === null) {
    content = (
      <Rooms
        userId={userId}
        onOpen={(id) => {
          setRoomId(id);
          setTab('today');
        }}
      />
    );
  } else {
    content = (
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

  return (
    <>
      <Header>
        {me.data && !editingName && (
          <Button variant="neutral" size="sm" className="min-w-0" onClick={() => setEditingName(true)}>
            <span className="truncate">{nameButtonText(me.data.name)}</span>
          </Button>
        )}
        <Button variant="neutral" size="sm" onClick={() => supabase.auth.signOut()}>
          Sair
        </Button>
      </Header>
      <Fragment key={nameVersion}>{content}</Fragment>
    </>
  );
}
