import { mulberry32, randomIndex } from './rng.ts';
import { HOME_BONUS, POINTS } from './types.ts';
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
 */
export function resolveNight(state: GameState, actions: Action[], seed: number): NightResult {
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
  const add = (playerId: PlayerId, delta: number, reason: LedgerReason) =>
    ledger.push({ playerId, delta, reason });

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

    // Caso 1: T está fora.
    if (isAway(t)) {
      for (const a of n) add(a, 0, 'ATTACK_TARGET_AWAY');
      for (const a of b) add(a, 0, 'BOMB_TARGET_AWAY');
      continue;
    }

    // Caso 2: T defendeu-se.
    if (choice(t) === 'DEFEND') {
      for (const a of n) add(a, -POINTS, 'ATTACK_DEFENDED');
      for (const a of b) add(a, -2 * POINTS, 'BOMB_DEFENDED');
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
        if (a === winner) add(a, POINTS, 'ATTACK_SUCCESS');
        else add(a, -POINTS, 'ATTACK_LOST_DRAW');
      }
    } else {
      for (const a of n) add(a, -POINTS, 'ATTACK_BOMBED');
      const share = Math.floor((POINTS + POINTS * n.length) / b.length);
      for (const a of b) add(a, share, 'BOMB_SUCCESS');
    }
  }

  return {
    ledger,
    summary: { players: state.players.map((p) => summaries.get(p)!) },
  };
}
