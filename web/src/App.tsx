import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import Login from './Login.tsx';
import Today from './Today.tsx';

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
      {session === undefined ? null : session ? <Today userId={session.user.id} /> : <Login />}
    </main>
  );
}
