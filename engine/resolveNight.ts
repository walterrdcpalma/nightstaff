import { NIGHTS } from './cycle.ts';
import { mulberry32, randomIndex } from './rng.ts';
import { DEFENDED_COST, HOME_BONUS, POINTS } from './types.ts';
import type {
  Action,
  ActionType,
  GameState,
  LedgerEntry,
  LedgerReason,
  NightResult,
  PlayerId,
  PlayerNightSummary,
} from './types.ts';
import { validateAction } from './validateAction.ts';
import type { ValidationError } from './validateAction.ts';

/** Ação que não devia ter chegado à resolução. Traz o jogador e o código para a `resolve-night` registar. */
export class InvalidActionError extends Error {
  readonly playerId: PlayerId;
  readonly code: ValidationError | 'DUPLICATE';

  constructor(playerId: PlayerId, code: ValidationError | 'DUPLICATE') {
    super(code === 'DUPLICATE' ? `Ação duplicada para ${playerId}` : `Ação inválida de ${playerId}: ${code}`);
    this.name = 'InvalidActionError';
    this.playerId = playerId;
    this.code = code;
  }
}

/**
 * Resolve uma noite (RULES.md §3). Função pura: o mesmo input dá sempre o mesmo output.
 * Quem não tem ação em `actions` fica com STAY. Ações inválidas ou duplicadas lançam `InvalidActionError`.
 * Na noite 9 (`state.night`), cada movimento conta a dobrar (RULES.md §1).
 */
export function resolveNight(state: GameState, actions: Action[], seed: number): NightResult {
  if (!Number.isInteger(state.night) || state.night < 1 || state.night > NIGHTS) {
    throw new RangeError(`Noite inválida: ${state.night} (esperado 1 a ${NIGHTS})`);
  }
  const byPlayer = new Map<PlayerId, Action>();
  for (const a of actions) {
    if (byPlayer.has(a.playerId)) throw new InvalidActionError(a.playerId, 'DUPLICATE');
    const v = validateAction(state, a);
    if (!v.ok) throw new InvalidActionError(a.playerId, v.error);
    byPlayer.set(a.playerId, a);
  }

  const choice = (p: PlayerId): ActionType => byPlayer.get(p)?.type ?? 'STAY';
  const isAway = (p: PlayerId) => choice(p) === 'ATTACK' || choice(p) === 'BOMB';

  // Ordem fixa, para que o sorteio não dependa da ordem de `actions`.
  const sorted = [...state.players].sort();

  const attackers = new Map<PlayerId, PlayerId[]>(); // N
  const bombers = new Map<PlayerId, PlayerId[]>(); // B
  for (const p of sorted) {
    const a = byPlayer.get(p);
    if (a?.type === 'ATTACK' || a?.type === 'BOMB') {
      const map = a.type === 'ATTACK' ? attackers : bombers;
      const t = a.targetId!;
      map.set(t, [...(map.get(t) ?? []), p]);
    }
  }

  const rng = mulberry32(seed);
  const ledger: LedgerEntry[] = [];
  const multiplier = state.night === NIGHTS ? 2 : 1;
  /** `targetId` só nos movimentos de quem atacou: o alvo é a escolha do próprio. */
  const add = (playerId: PlayerId, delta: number, reason: LedgerReason, targetId?: PlayerId) =>
    ledger.push({ playerId, delta: delta * multiplier, reason, ...(targetId && { targetId }) });

  const summaries = new Map<PlayerId, PlayerNightSummary>();

  for (const t of sorted) {
    const n = attackers.get(t) ?? [];
    const b = bombers.get(t) ?? [];
    const s: PlayerNightSummary = {
      playerId: t,
      location: isAway(t) ? 'AWAY' : 'HOME',
      attacks: n.length,
      bombs: b.length,
      defended: false,
      revealedAttackers: [],
      draw: false,
      homeBonus: false,
    };
    summaries.set(t, s);

    if (n.length + b.length === 0) {
      if (!isAway(t)) {
        add(t, HOME_BONUS, 'HOME_BONUS');
        s.homeBonus = true;
      }
      continue;
    }

    // Caso 1: T está fora. Os ataques normais falham, mas a bomba acerta na mesma.
    if (isAway(t)) {
      for (const a of n) add(a, 0, 'ATTACK_TARGET_AWAY', t);
      if (b.length > 0) {
        add(t, -POINTS, 'VICTIM');
        const share = Math.floor(POINTS / b.length);
        for (const a of b) add(a, share, 'BOMB_SUCCESS', t);
      }
      continue;
    }

    // Caso 2: T defendeu-se.
    if (choice(t) === 'DEFEND') {
      for (const a of n) add(a, -DEFENDED_COST.ATTACK, 'ATTACK_DEFENDED', t);
      for (const a of b) add(a, -DEFENDED_COST.BOMB, 'BOMB_DEFENDED', t);
      add(t, POINTS * (n.length + b.length), 'DEFENSE');
      s.defended = true;
      s.revealedAttackers = [...n, ...b].sort();
      continue;
    }

    // Caso 3: T em casa sem defesa.
    add(t, -POINTS, 'VICTIM');
    if (b.length === 0) {
      const winner = n.length === 1 ? n[0] : n[randomIndex(rng, n.length)];
      s.draw = n.length > 1;
      for (const a of n) {
        if (a === winner) add(a, POINTS, 'ATTACK_SUCCESS', t);
        else add(a, -POINTS, 'ATTACK_LOST_DRAW', t);
      }
    } else {
      for (const a of n) add(a, -POINTS, 'ATTACK_BOMBED', t);
      const share = Math.floor((POINTS + POINTS * n.length) / b.length);
      for (const a of b) add(a, share, 'BOMB_SUCCESS', t);
    }
  }

  return {
    ledger,
    summary: { players: state.players.map((p) => summaries.get(p)!) },
  };
}
