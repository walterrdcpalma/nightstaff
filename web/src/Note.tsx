import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { visibleResult } from '@/lib/load';
import type { LoadResult } from '@/lib/load';

/** Cartão com título e texto do narrador. */
export function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-secondary-background">
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Falha a ler os dados (rede, sessão…), com botão para tentar outra vez. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Note title="As luzes da rua apagaram-se">
      <p className="mb-4">Não conseguimos ler o bairro. Verifica a ligação.</p>
      <Button variant="neutral" onClick={onRetry}>
        Espreitar outra vez
      </Button>
    </Note>
  );
}

/**
 * Carrega dados com `load`; devolve `undefined` enquanto carrega e `error` se falhar.
 * Um `reload` mantém os dados à vista; quando `load` muda (outro ciclo, outro dia), os dados antigos
 * deixam de se ver e as respostas atrasadas de leituras antigas são ignoradas.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [result, setResult] = useState<LoadResult<() => Promise<T>, T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let ignore = false;
    load().then(
      (data) => !ignore && setResult({ load, data }),
      () => !ignore && setResult({ load, error: true }),
    );
    return () => {
      ignore = true;
    };
  }, [load, attempt]);
  return { ...visibleResult(result, load), reload };
}
