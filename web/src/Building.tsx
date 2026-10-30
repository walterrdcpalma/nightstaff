// O prédio do Bairro (T19, opção B do protótipo): SVG inline, uma divisão por jogador. Só desenho: as divisões vêm
// de `lib/building.ts`, que só lê o resumo público (casa/fora e apanhados).
import {
  BUILDING_WIDTH,
  RECEPTION_HEIGHT,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  buildingHeight,
  receptionY,
} from '@/lib/building';
import type { BuildingRoom } from '@/lib/building';

/** Ao mudar de noite, as janelas acendem e apagam devagar (só com movimento). */
const FADE = 'motion-safe:transition-opacity motion-safe:duration-500';
const INK = 'var(--border)';
/** Faixa da cor do jogador, à esquerda da divisão, com a inicial. */
const STRIPE = 18;
const WINDOW = 50;

export function Building({ rooms, night }: { rooms: BuildingRoom[]; night: number }) {
  const height = buildingHeight(rooms.length);
  const reception = receptionY(rooms.length);
  const mid = BUILDING_WIDTH / 2;
  return (
    <svg role="group" aria-label={`O prédio na noite ${night}`} viewBox={`0 0 ${BUILDING_WIDTH} ${height}`} className="block h-auto w-full">
      {/* Letreiro. */}
      <rect x={14} y={8} width={BUILDING_WIDTH - 28} height={40} fill="var(--secondary-background)" stroke={INK} strokeWidth={3} />
      <text x={mid} y={36} textAnchor="middle" fontSize={20} letterSpacing="0.08em" fontFamily="var(--font-heading)" fill="var(--main)">
        NIGHT STAFF
      </text>
      {/* Fachada. */}
      <rect x={14} y={48} width={BUILDING_WIDTH - 28} height={reception - 48} fill="var(--background)" stroke={INK} strokeWidth={3} />
      {rooms.map((r) => (
        <Room key={r.id} room={r} />
      ))}
      {/* Receção. */}
      <rect x={14} y={reception} width={BUILDING_WIDTH - 28} height={RECEPTION_HEIGHT} fill="var(--secondary-background)" stroke={INK} strokeWidth={3} />
      <rect x={mid - 30} y={reception + 6} width={60} height={RECEPTION_HEIGHT - 6} fill="var(--main)" stroke={INK} strokeWidth={3} />
      <text x={mid} y={reception + 29} textAnchor="middle" fontSize={10} fontWeight={600} letterSpacing="0.06em" fill="var(--main-foreground)">
        RECEÇÃO
      </text>
    </svg>
  );
}

function Room({ room: r }: { room: BuildingRoom }) {
  const wx = r.x + STRIPE + 8;
  const wy = r.y + (ROOM_HEIGHT - WINDOW) / 2;
  const tx = (wx + WINDOW + r.x + ROOM_WIDTH) / 2;
  return (
    <g role="img" aria-label={r.label}>
      {/* Divisão com sombra dura (neobrutalism) e a faixa do jogador. */}
      <rect x={r.x + 4} y={r.y + 4} width={ROOM_WIDTH} height={ROOM_HEIGHT} fill={INK} />
      <rect x={r.x} y={r.y} width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="var(--secondary-background)" stroke={INK} strokeWidth={3} />
      <rect x={r.x + 1.5} y={r.y + 1.5} width={STRIPE} height={ROOM_HEIGHT - 3} fill={r.color} />
      <text x={r.x + 1.5 + STRIPE / 2} y={r.y + ROOM_HEIGHT / 2 + 5} textAnchor="middle" fontSize={13} fontFamily="var(--font-heading)" fill="var(--main-foreground)">
        {r.initial}
      </text>
      {/* Janela: apagada com X (fora) por baixo; acesa com a silhueta (em casa) por cima, que aparece ou desaparece. */}
      <rect x={wx} y={wy} width={WINDOW} height={WINDOW} fill="var(--background)" stroke={INK} strokeWidth={3} />
      <path
        d={`M${wx + 6},${wy + 6} L${wx + WINDOW - 6},${wy + WINDOW - 6} M${wx + WINDOW - 6},${wy + 6} L${wx + 6},${wy + WINDOW - 6}`}
        stroke="#4a5278"
        strokeWidth={3}
      />
      <g opacity={r.home ? 1 : 0} className={FADE} style={{ filter: 'drop-shadow(0 0 6px var(--main))' }}>
        <rect x={wx} y={wy} width={WINDOW} height={WINDOW} fill="var(--main)" stroke={INK} strokeWidth={3} />
        <circle cx={wx + WINDOW / 2} cy={wy + 21} r={8.5} fill="var(--background)" />
        <path d={`M${wx + 9},${wy + WINDOW - 1.5} a16 16 0 0 1 32 0 z`} fill="var(--background)" />
      </g>
      {/* Nome e estado, em texto. */}
      <text x={tx} y={r.y + 32} textAnchor="middle" fontSize={12} fontFamily="var(--font-heading)" fill="var(--foreground)">
        <title>{r.name}</title>
        {r.shortName}
      </text>
      <text
        x={tx}
        y={r.y + 54}
        textAnchor="middle"
        fontSize={12}
        fontWeight={r.home ? 600 : 400}
        fill={r.home ? 'var(--main)' : '#8b93b5'}
      >
        {r.home ? 'em casa' : 'fora'}
      </text>
      {/* Sirene de quem foi apanhado, no canto da divisão, sem dizer onde foi. */}
      {r.caught && (
        <text x={r.x + ROOM_WIDTH - 12} y={r.y + 18} textAnchor="middle" fontSize={16}>
          🚨
        </text>
      )}
    </g>
  );
}
