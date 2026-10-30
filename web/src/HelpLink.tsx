import { createContext, useContext } from 'react';
import type { HelpAnchor } from '@/lib/help';

/** Abre a Ajuda (estado do `App`, sem router), já na secção ou pergunta da âncora; sem âncora, no início. */
export const HelpContext = createContext<(anchor?: HelpAnchor) => void>(() => {});

/** Ajuda contextual (T21): um "?" pequeno que abre a Ajuda na secção certa. */
export function HelpLink({ anchor, label }: { anchor: HelpAnchor; label: string }) {
  const openHelp = useContext(HelpContext);
  return (
    <button
      type="button"
      aria-label={`Ajuda: ${label}`}
      title={label}
      onClick={() => openHelp(anchor)}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-secondary-background align-middle font-heading text-xs text-foreground hover:border-main"
    >
      ?
    </button>
  );
}
