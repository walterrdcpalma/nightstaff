import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import Login from './Login.tsx';
import { Morning, Neighborhood } from './Neighborhood.tsx';
import Points from './Points.tsx';
import Today from './Today.tsx';

const TABS = { today: '🌙 Hoje', morning: '☀️ Manhã', neighborhood: '🏘️ Bairro', points: '💰 Pontos' } as const;
type Tab = keyof typeof TABS;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('today');

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
      {session === undefined ? null : session ? (
        <>
          <nav className="grid grid-cols-2 gap-2">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? 'default' : 'neutral'} onClick={() => setTab(t)} className="px-1">
                {TABS[t]}
              </Button>
            ))}
          </nav>
          {tab === 'today' && <Today userId={session.user.id} />}
          {tab === 'morning' && <Morning userId={session.user.id} />}
          {tab === 'neighborhood' && <Neighborhood userId={session.user.id} />}
          {tab === 'points' && <Points userId={session.user.id} />}
        </>
      ) : (
        <Login />
      )}
    </main>
  );
}
