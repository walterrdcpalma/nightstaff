// Tipos e constantes do motor. Regras em RULES.md §1–3.

export type PlayerId = string;

export type ActionType = 'STAY' | 'DEFEND' | 'ATTACK' | 'BOMB';

export interface Action {
  playerId: PlayerId;
  type: ActionType;
  /** Obrigatório em ATTACK e BOMB; ausente em STAY e DEFEND. */
  targetId?: PlayerId | null;
}

export interface GameState {
  players: PlayerId[];
  /** Noite a resolver, de 1 a 9. A última conta a dobrar (RULES.md §1). */
  night: number;
  /** Ações das noites ANTERIORES (não incluir a noite atual). Servem para as quotas. */
  pastActions: Action[];
}

/** Salário de cada ciclo: os pontos de um jogador são `SALARY + soma do ledger` (RULES.md §1). */
export const SALARY = 50;
/** Pontos por ataque (RULES.md §1). */
export const POINTS = 10;
/** Bónus de casa (RULES.md §1). */
export const HOME_BONUS = 2;
/** O que perde quem ataca um jogador que se defendeu (RULES.md §3, caso 2). */
export const DEFENDED_COST = { ATTACK: 5, BOMB: 10 } as const;

export const ACTION_TYPES: readonly ActionType[] = ['STAY', 'DEFEND', 'ATTACK', 'BOMB'];

/** Ações com quota. STAY é ilimitado e por isso fica de fora (e tudo continua serializável em JSON). */
export type LimitedActionType = Exclude<ActionType, 'STAY'>;

/** Quotas por jogo (RULES.md §2). */
export const QUOTAS: Record<LimitedActionType, number> = {
  DEFEND: 2,
  ATTACK: 3,
  BOMB: 1,
};

export type LedgerReason =
  | 'ATTACK_SUCCESS' // ataque bem-sucedido: único atacante ou vencedor do sorteio (+10)
  | 'ATTACK_LOST_DRAW' // perdeu o sorteio (-10)
  | 'ATTACK_BOMBED' // atacante normal "morre" porque houve bomba no alvo (-10)
  | 'ATTACK_DEFENDED' // atacou quem se defendeu (-5)
  | 'ATTACK_TARGET_AWAY' // alvo estava fora (0)
  | 'BOMB_SUCCESS' // parte do bolo, também com o alvo fora
  | 'BOMB_DEFENDED' // bombardeou quem se defendeu (-10)
  | 'VICTIM' // atacado em casa sem defesa, ou bombardeado mesmo fora (-10)
  | 'DEFENSE' // defendeu-se: +10 por atacante
  | 'HOME_BONUS'; // em casa e não foi alvo (+2)

export interface LedgerEntry {
  playerId: PlayerId;
  /** Já multiplicado por 2 na última noite. */
  delta: number;
  reason: LedgerReason;
  /** Alvo da Visita ou Reunião do próprio jogador (razões `ATTACK_*` e `BOMB_*`). Serve o confronto direto (RULES.md §5). */
  targetId?: PlayerId;
}

/** Resumo público de um jogador numa noite. Sem pontos (CLAUDE.md, RULES.md §4). */
export interface PlayerNightSummary {
  playerId: PlayerId;
  location: 'HOME' | 'AWAY';
  /** Ataques normais recebidos (também conta se estava fora). */
  attacks: number;
  /** Bombas recebidas (também conta se estava fora). */
  bombs: number;
  /** Escolheu DEFEND e foi alvo de pelo menos um ataque ou bomba. */
  defended: boolean;
  /** Atacantes e bombistas revelados; só preenchido quando `defended`. */
  revealedAttackers: PlayerId[];
  /** Houve sorteio neste alvo. */
  draw: boolean;
  homeBonus: boolean;
}

export interface NightSummary {
  players: PlayerNightSummary[];
}

export interface NightResult {
  ledger: LedgerEntry[];
  summary: NightSummary;
}
