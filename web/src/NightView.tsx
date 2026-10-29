import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadMyEntries } from '@/lib/data';
import type { ResolvedNight } from '@/lib/data';
import { privateReport } from '@/lib/night';
import { storyScenes } from '@/lib/story';
import type { Scene } from '@/lib/story';
import { cn } from '@/lib/utils';
import { LoadError, Note, useLoad } from './Note.tsx';

/** Com `prefers-reduced-motion`, a história aparece toda de uma vez e sem animações. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Manhã em modo história (T12): a noite contada uma cena de cada vez, como um narrador. Primeiro o que é
 * público (casa/fora de cada um e os apanhados, RULES.md §4); por fim, a minha noite, só do meu ledger.
 * Seguinte (ou um toque na história) avança, Saltar mostra tudo e, no fim, Ver outra vez recomeça.
 */
export function NightView(props: { gameId: number; night: ResolvedNight; names: Map<string, string>; userId: string }) {
  const { gameId, night, names, userId } = props;
  const nameOf = (id: string) => names.get(id) ?? '?';
  const scenes = storyScenes(night, nameOf);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? scenes.length : 1));
  const last = useRef<HTMLDivElement>(null);
  const done = shown >= scenes.length;

  // A cena nova fica à vista, sem saltos para quem prefere menos movimento.
  useEffect(() => {
    if (shown > 1) last.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [shown]);

  const next = () => setShown((n) => Math.min(n + 1, scenes.length));

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn('flex flex-col gap-4', !done && 'cursor-pointer')}
        onClick={done ? undefined : next}
        aria-live="polite"
      >
        {scenes.slice(0, shown).map((scene, i) => (
          <div key={i} ref={i === shown - 1 ? last : undefined} className="motion-safe:animate-scene-in">
            <SceneCard scene={scene} gameId={gameId} night={night.night} userId={userId} nameOf={nameOf} />
          </div>
        ))}
      </div>

      {done ? (
        <Button variant="neutral" onClick={() => setShown(1)}>
          🔁 Ver outra vez
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={next}>Seguinte ▶</Button>
          <Button variant="neutral" onClick={() => setShown(scenes.length)}>
            Saltar ⏭
          </Button>
        </div>
      )}
    </div>
  );
}

function SceneCard(props: { scene: Scene; gameId: number; night: number; userId: string; nameOf: (id: string) => string }) {
  const { scene } = props;
  switch (scene.kind) {
    case 'OPENING':
      return (
        <Note title={`🌙 Noite ${scene.night}`}>
          <p>{scene.text}</p>
          {scene.night === 9 && <p className="text-main">A última noite: contou a dobrar.</p>}
        </Note>
      );
    case 'PLAYER':
      return (
        <div className="flex items-center gap-3 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
          <span
            aria-label={scene.home ? 'em casa' : 'fora'}
            className={cn(
              'size-8 shrink-0 rounded-sm border-2 border-border',
              scene.home ? 'bg-main shadow-[0_0_10px_var(--main)]' : 'bg-background',
            )}
          />
          <p>{scene.text}</p>
        </div>
      );
    case 'CAUGHT':
      return (
        <Note title="📰 Apanhados">
          <div className="flex flex-col gap-2">
            {scene.lines.map((l) => (
              <p key={l} className="font-heading text-danger">
                {l}
              </p>
            ))}
          </div>
        </Note>
      );
    case 'MINE':
      return <MyNight gameId={props.gameId} night={props.night} userId={props.userId} nameOf={props.nameOf} />;
  }
}

/** A minha noite: o relatório privado (o que me aconteceu e os pontos da noite), só do meu ledger. */
function MyNight(props: { gameId: number; night: number; userId: string; nameOf: (id: string) => string }) {
  const { gameId, night, userId } = props;
  const mine = useLoad(useCallback(() => loadMyEntries(gameId, night, userId), [gameId, night, userId]));
  const report = mine.data && privateReport(mine.data, props.nameOf);

  return (
    <Note title={`☀️ A tua noite ${night}`}>
      {mine.error ? (
        <LoadError onRetry={mine.reload} />
      ) : !report ? (
        <p>A ler o teu relatório…</p>
      ) : (
        <div className="flex flex-col gap-1">
          {report.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="mt-2 font-heading">
            Pontos da noite: <span className="text-main">{report.total}</span>
          </p>
          <p className="text-xs">Só tu vês isto.</p>
        </div>
      )}
    </Note>
  );
}
