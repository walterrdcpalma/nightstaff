import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NAME_MAX, nameError } from '@/lib/rooms';
import { supabase } from '@/lib/supabase';
import { Note } from './Note.tsx';

/**
 * O nome que os outros vão ver. No primeiro login cria o meu `players`; com `current`, muda-o (T15), já
 * preenchido, com Guardar e Cancelar. A RLS só deixa criar e mudar o próprio.
 */
export default function NameForm(props: { userId: string; current?: string; onDone: () => void; onCancel?: () => void }) {
  const editing = props.current !== undefined;
  const [name, setName] = useState(props.current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const invalid = nameError(name);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    // Com `.select()`, um `update` que a RLS filtrasse devolve 0 linhas: mostra-se o erro em vez de fechar.
    const { data, error } = editing
      ? await supabase.from('players').update({ name: name.trim() }).eq('id', props.userId).select('id')
      : await supabase.from('players').insert({ id: props.userId, name: name.trim() }).select('id');
    setBusy(false);
    if (error || data.length !== 1) return setError('Não deu para guardar o nome. Tenta outra vez.');
    props.onDone();
  }

  return (
    <Note title={editing ? '🪪 Mudar o meu nome' : '🪪 Como te chamam no bairro?'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <p>É o nome que os outros vão ver nas salas, nas manchetes e no ranking.</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX + 10} placeholder="O teu nome" />
        {editing ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'A guardar…' : 'Guardar'}
            </Button>
            <Button type="button" variant="neutral" onClick={props.onCancel} disabled={busy}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="submit" disabled={busy}>
            {busy ? 'A guardar…' : 'Entrar no bairro'}
          </Button>
        )}
        {error && <p className="text-danger">{error}</p>}
      </form>
    </Note>
  );
}
