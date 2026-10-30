import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { helpElementId, helpFaq, helpSections } from '@/lib/help';
import type { HelpAnchor, HelpSection } from '@/lib/help';
import { Note } from './Note.tsx';

/**
 * Ajuda (T13, reescrita na T21): por cima do ecrã atual, sem router. Primeiro "como funciona", pela ordem de
 * `helpSections`, depois as perguntas frequentes, que abrem e fecham (`<details>`). Com uma âncora (o "?" de um
 * ecrã), abre já nessa secção ou com essa pergunta aberta. Estática: não lê nada da BD.
 */
export default function Help({ anchor, onClose }: { anchor?: HelpAnchor; onClose: () => void }) {
  // Esc fecha, como qualquer janela por cima.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (anchor) document.getElementById(helpElementId(anchor))?.scrollIntoView({ block: 'start' });
  }, [anchor]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Ajuda" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background py-2">
          <h1 className="text-2xl text-main">❓ Como funciona</h1>
          <Button variant="neutral" size="sm" onClick={onClose} autoFocus>
            Fechar
          </Button>
        </header>

        {helpSections().map((s) => (
          <Section key={s.id} section={s} />
        ))}

        <h2 className="text-xl">Perguntas frequentes</h2>
        <div className="flex flex-col gap-3">
          {helpFaq().map((q) => (
            <details
              key={q.question}
              id={q.id && helpElementId(q.id)}
              open={q.id !== undefined && q.id === anchor}
              className="scroll-mt-16 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
            >
              <summary className="cursor-pointer font-heading">{q.question}</summary>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                {q.answer.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>

        <Button variant="neutral" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

function Paragraphs({ items }: { items: string[] }) {
  return items.map((p) => <p key={p}>{p}</p>);
}

function Section({ section: s }: { section: HelpSection }) {
  return (
    <div id={helpElementId(s.id)} className="scroll-mt-16">
      <Note title={s.title}>
        <div className="flex flex-col gap-3">
          <Paragraphs items={s.intro} />
          {s.actions && (
            <ul className="flex flex-col gap-3">
              {s.actions.map((a) => (
                <li key={a.name} className="flex flex-col gap-1 rounded-base border-2 border-border p-2">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-heading">{a.name}</span>
                    <span className="flex gap-1">
                      <Badge variant="neutral">{a.home ? '🪟 em casa' : '🌑 fora'}</Badge>
                      <Badge variant="neutral">{a.quota}</Badge>
                    </span>
                  </span>
                  <span className="text-sm">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          {s.table && (
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[42%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="p-1 font-heading">O que fazes / o dono</th>
                  <th className="p-1 font-heading">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {s.table.map((r) => (
                  <tr key={r.action + r.target} className="border-b border-border align-top">
                    <td className="p-1">
                      <span className="block font-heading">{r.action}</span>
                      <span className="block text-xs">{r.target}</span>
                    </td>
                    <td className="p-1">{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Paragraphs items={s.outro} />
        </div>
      </Note>
    </div>
  );
}
