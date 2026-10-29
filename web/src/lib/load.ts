// Regra do `useLoad` (Note.tsx), pura para se poder testar.

export interface LoadResult<L, T> {
  /** A leitura que produziu este resultado. */
  load: L;
  data?: T;
  error?: boolean;
}

/**
 * O que se mostra: só o resultado da leitura atual. O de uma leitura antiga (outro ciclo, outro dia)
 * não se mostra, e um `reload` da mesma leitura mantém os dados à vista até chegar a resposta nova.
 */
export function visibleResult<L, T>(result: LoadResult<L, T> | null, load: L): { data?: T; error: boolean } {
  const current = result?.load === load ? result : null;
  return { data: current?.data, error: !!current?.error };
}
