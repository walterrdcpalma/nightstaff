// Rua à noite (T19): SVG inline, uma casa por jogador. Só desenho: as casas vêm de `lib/street.ts`, que só lê o
// resumo público (casa/fora e apanhados).
import { HOUSE_WIDTH, STREET_HEIGHT, streetWidth } from '@/lib/street';
import type { StreetHouse } from '@/lib/street';

/** Ao mudar de noite, as janelas acendem e apagam devagar (só com movimento). */
const FADE = 'motion-safe:transition-[fill,opacity] motion-safe:duration-300';

export function Street({ houses, night }: { houses: StreetHouse[]; night: number }) {
  const width = streetWidth(houses.length);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <svg
        role="group"
        aria-label={`A rua na noite ${night}`}
        viewBox={`0 0 ${width} ${STREET_HEIGHT}`}
        width={width}
        height={STREET_HEIGHT}
        className="block max-w-none"
      >
        {/* Passeio. */}
        <line x1={0} y1={122} x2={width} y2={122} stroke="var(--border)" strokeWidth={3} />
        {houses.map((h) => (
          <House key={h.id} house={h} />
        ))}
      </svg>
    </div>
  );
}

function House({ house: h }: { house: StreetHouse }) {
  const cx = h.x + HOUSE_WIDTH / 2;
  return (
    <g role="img" aria-label={h.label}>
      {/* Telhado e fachada, com os contornos grossos do tema. */}
      <polygon
        points={`${h.x + 6},52 ${cx},20 ${h.x + HOUSE_WIDTH - 6},52`}
        fill="var(--background)"
        stroke="var(--border)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <rect x={h.x + 12} y={52} width={HOUSE_WIDTH - 24} height={70} fill="var(--secondary-background)" stroke="var(--border)" strokeWidth={3} />
      {/* Janela: acesa (ouro) em casa; apagada e com cortina cruzada fora, para não depender só da cor. */}
      <rect
        x={h.x + 22}
        y={64}
        width={24}
        height={22}
        fill={h.home ? 'var(--main)' : 'var(--background)'}
        stroke="var(--border)"
        strokeWidth={2.5}
        className={FADE}
        style={h.home ? { filter: 'drop-shadow(0 0 6px var(--main))' } : undefined}
      />
      <path
        d={`M${h.x + 24},66 L${h.x + 44},84 M${h.x + 44},66 L${h.x + 24},84`}
        stroke="var(--border)"
        strokeWidth={2}
        opacity={h.home ? 0 : 0.7}
        className={FADE}
      />
      {/* Porta. */}
      <rect x={h.x + 54} y={88} width={20} height={34} fill="var(--background)" stroke="var(--border)" strokeWidth={2.5} />
      {/* Sirene de quem foi apanhado: por cima da sua casa, sem dizer onde foi. */}
      {h.caught && (
        <g>
          <circle cx={cx} cy={12} r={11} fill="var(--danger)" stroke="var(--border)" strokeWidth={2} />
          <text x={cx} y={17} textAnchor="middle" fontSize={13}>
            🚨
          </text>
        </g>
      )}
      {/* Avatar (como na T18) e nome por baixo. */}
      <circle cx={cx} cy={142} r={14} fill={h.color} stroke="var(--border)" strokeWidth={2} />
      <text x={cx} y={148} textAnchor="middle" fontSize={15} fontFamily="var(--font-heading)" fill="var(--main-foreground)">
        {h.initial}
      </text>
      <text x={cx} y={176} textAnchor="middle" fontSize={13} fontFamily="var(--font-heading)" fill="var(--foreground)">
        <title>{h.name}</title>
        {h.shortName}
      </text>
    </g>
  );
}
