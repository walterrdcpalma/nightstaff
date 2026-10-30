// Escolha da noite em cartas (T18): uma carta grande por ação e os alvos como avatares. Só desenho: o estado de
// cada carta e as cores vêm de `lib/cards.ts`, e as regras do engine/.
import type { ActionType } from '../../engine/index.ts';
import { avatarColor, avatarInitial } from '@/lib/cards';
import type { ActionCard } from '@/lib/cards';
import { BLOCKED_TARGET_TEXT } from '@/lib/today';
import type { TargetOption } from '@/lib/today';
import { cn } from '@/lib/utils';

/** Contorno grosso e sombra dura na escolha atual (neobrutalism); as outras, contorno fino e sem sombra. */
const pick = (selected: boolean) =>
  selected ? 'border-4 border-main shadow-shadow' : 'border-2 border-border hover:border-main';

export function ActionCards(props: { cards: ActionCard[]; onPick: (type: ActionType) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {props.cards.map((c) => (
        <button
          key={c.type}
          type="button"
          aria-pressed={c.selected}
          disabled={c.disabled}
          onClick={() => props.onPick(c.type)}
          className={cn(
            'flex flex-col gap-2 rounded-base bg-secondary-background p-4 text-left motion-safe:transition-[border-color,box-shadow]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            pick(c.selected),
          )}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-heading text-lg">{c.name}</span>
            <Dots dots={c.dots} />
          </span>
          <span className="text-sm">{c.reason ?? c.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Quota em pontinhos: cheio = por gastar. A Folga não tem limite. */
function Dots({ dots }: { dots: boolean[] | null }) {
  if (dots === null) return <span aria-label="sem limite">∞</span>;
  const left = dots.filter(Boolean).length;
  return (
    <span className="flex shrink-0 gap-1" aria-label={`${left} de ${dots.length} por gastar`}>
      {dots.map((full, i) => (
        <span key={i} className={cn('size-3 rounded-full border-2 border-border', full && 'bg-main')} />
      ))}
    </span>
  );
}

export function TargetAvatars(props: { targets: TargetOption[]; selected: string | null; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {props.targets.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={props.selected === p.id}
          disabled={p.blocked}
          onClick={() => props.onPick(p.id)}
          className={cn(
            'flex min-h-28 flex-col items-center gap-2 rounded-base bg-secondary-background p-3 motion-safe:transition-[border-color,box-shadow]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            pick(props.selected === p.id),
          )}
        >
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full border-2 border-border font-heading text-xl text-main-foreground"
            style={{ backgroundColor: avatarColor(p.id) }}
          >
            {p.blocked ? '🚫' : avatarInitial(p.name)}
          </span>
          <span className="break-all text-center text-sm font-heading">{p.name}</span>
          {p.blocked && <span className="text-center text-xs">{BLOCKED_TARGET_TEXT}</span>}
        </button>
      ))}
    </div>
  );
}
