import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

/** Carrega dados com `load`; devolve `undefined` enquanto carrega e `error` se falhar. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    setError(false);
    load().then(setData, () => setError(true));
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}
