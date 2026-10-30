import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { helpActions, helpFaq, helpSections } from '@/lib/help';
import { Note } from './Note.tsx';

/**
 * Ajuda (T13): por cima do ecrã atual, sem router. Primeiro "como funciona, em 1 minuto", depois as perguntas
 * frequentes, que abrem e fecham (`<details>`). Estática: não lê nada da BD.
 */
export default function Help({ onClose }: { onClose: () => void }) {
  // Esc fecha, como qualquer janela por cima.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [idea, homeAway, ...rest] = helpSections();

  return (
    <div role="dialog" aria-modal="true" aria-label="Ajuda" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background py-2">
          <h1 className="text-2xl text-main">❓ Como funciona</h1>
          <Button variant="neutral" size="sm" onClick={onClose} autoFocus>
            Fechar
          </Button>
        </header>

        <h2 className="text-xl">Em 1 minuto</h2>
        {[idea, homeAway].map((s) => (
          <Section key={s.title} title={s.title} paragraphs={s.paragraphs} />
        ))}

        <Note title="🎬 As ações">
          <ul className="flex flex-col gap-3">
            {helpActions().map((a) => (
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
        </Note>

        {rest.map((s) => (
          <Section key={s.title} title={s.title} paragraphs={s.paragraphs} />
        ))}

        <h2 className="text-xl">Perguntas frequentes</h2>
        <div className="flex flex-col gap-3">
          {helpFaq().map((q) => (
            <details key={q.question} className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
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

function Section({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return (
    <Note title={title}>
      <div className="flex flex-col gap-2">
        {paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </Note>
  );
}
