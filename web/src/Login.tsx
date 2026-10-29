import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';

/** Login por magic link. O registo é aberto (RULES.md §1 v6): o primeiro link cria a conta. */
export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function send(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setState(error ? 'error' : 'sent');
  }

  return (
    <Card className="bg-secondary-background">
      <CardHeader>
        <CardTitle>
          <h2>Entrada do pessoal</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state === 'sent' ? (
          <p>Enviámos-te um link. Abre o email e entra pelo portão das traseiras.</p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4">
            <p>Diz-nos o teu email e mandamos-te a chave do bairro.</p>
            <Input type="email" required placeholder="o-teu@email.pt" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'A enviar…' : 'Enviar link'}
            </Button>
            {state === 'error' && (
              <p className="text-danger">Não conseguimos enviar. Só entra quem foi convidado.</p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
