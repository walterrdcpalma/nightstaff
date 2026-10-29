import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NAME_MAX, nameError } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import { Note } from './Note.tsx';

/** Primeiro login: o nome que os outros vão ver. Cria o meu `players` (a RLS só deixa criar o próprio). */
export default function NameForm(props: { userId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const invalid = nameError(name);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    const { error } = await supabase.from('players').insert({ id: props.userId, name: name.trim() });
    setBusy(false);
    if (error) return setError('Não deu para guardar o nome. Tenta outra vez.');
    props.onDone();
  }

  return (
    <Note title="🪪 Como te chamam no bairro?">
      <form onSubmit={save} className="flex flex-col gap-4">
        <p>É o nome que os outros vão ver nas salas, nas manchetes e no ranking.</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX + 10} placeholder="O teu nome" />
        <Button type="submit" disabled={busy}>
          {busy ? 'A guardar…' : 'Entrar no bairro'}
        </Button>
        {error && <p className="text-danger">{error}</p>}
      </form>
    </Note>
  );
}
