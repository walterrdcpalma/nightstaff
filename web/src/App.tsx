import { Fragment, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { loadIsAppAdmin, loadMe } from '@/lib/data';
import type { HelpAnchor } from '@/lib/help';
import { nameButtonText } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import AdminPanel from './AdminPanel.tsx';
import Help from './Help.tsx';
import { HelpContext } from './HelpLink.tsx';
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
  // A ajuda abre por cima de qualquer ecrã (T13), sem router: o ecrã de baixo mantém o estado. Com uma âncora (o "?"
  // de um ecrã, T21), abre nessa secção; sem âncora ('top'), no início.
  const [help, setHelp] = useState<HelpAnchor | 'top' | null>(null);
  const openHelp = useCallback((anchor?: HelpAnchor) => setHelp(anchor ?? 'top'), []);
  const closeHelp = useCallback(() => setHelp(null), []);
  // 🛠️ Painel da app (T23): também por cima, só para o admin da app.
  const [panel, setPanel] = useState(false);
  const openPanel = useCallback(() => setPanel(true), []);
  const closePanel = useCallback(() => setPanel(false), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      {/* Com a ajuda (ou o painel) aberta, o ecrã de baixo fica `inert`: o Tab e os leitores de ecrã ficam só nela. */}
      <div className="contents" inert={help !== null || panel}>
        <HelpContext.Provider value={openHelp}>
          {session === undefined ? (
            <Header onHelp={openHelp} />
          ) : session ? (
            <SignedIn key={session.user.id} userId={session.user.id} onHelp={openHelp} onPanel={openPanel} />
          ) : (
            <>
              <Header onHelp={openHelp} />
              <Login />
            </>
          )}
        </HelpContext.Provider>
      </div>
      {panel && session && <AdminPanel onClose={closePanel} />}
      {help && <Help anchor={help === 'top' ? undefined : help} onClose={closeHelp} />}
    </main>
  );
}

/** Cabeçalho da app: ❓ Ajuda em todos os ecrãs e, com sessão, o meu nome e Sair. */
function Header({ onHelp, children }: { onHelp: () => void; children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2">
      <h1 className="text-2xl text-main">Night Staff</h1>
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="neutral" size="sm" className="shrink-0" onClick={() => onHelp()}>
          ❓ Ajuda
        </Button>
        {children}
      </div>
    </header>
  );
}

/**
 * Com sessão: primeiro o nome (primeiro login), depois as salas; dentro de uma sala, as abas só dessa sala.
 * No cabeçalho, o meu nome abre o formulário para o mudar (T15) e, só para o admin da app, 🛠️ Painel (T23).
 */
function SignedIn({ userId, onHelp, onPanel }: { userId: string; onHelp: () => void; onPanel: () => void }) {
  const me = useLoad(useCallback(() => loadMe(userId), [userId]));
  // Se a pergunta falhar, o botão simplesmente não aparece: o painel não é preciso para jogar.
  const appAdmin = useLoad(useCallback(() => loadIsAppAdmin(), []));
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
      <Header onHelp={onHelp}>
        {appAdmin.data === true && (
          <Button variant="neutral" size="sm" className="shrink-0" onClick={onPanel}>
            🛠️ Painel
          </Button>
        )}
        {me.data && !editingName && (
          <Button variant="neutral" size="sm" className="min-w-0" onClick={() => setEditingName(true)}>
            <span className="truncate">{nameButtonText(me.data.name)}</span>
          </Button>
        )}
        <Button variant="neutral" size="sm" className="shrink-0" onClick={() => supabase.auth.signOut()}>
          Sair
        </Button>
      </Header>
      <Fragment key={nameVersion}>{content}</Fragment>
    </>
  );
}
