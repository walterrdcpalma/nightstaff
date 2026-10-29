// Tipos e constantes do motor. Regras em RULES.md §1–3.

export type PlayerId = string;

export type ActionType = 'STAY' | 'DEFEND' | 'ATTACK' | 'BOMB' | 'VANISH';

export interface Action {
  playerId: PlayerId;
  type: ActionType;
  /** Obrigatório em ATTACK e BOMB; ausente em STAY, DEFEND e VANISH. */
  targetId?: PlayerId | null;
}

/** Ação de uma noite anterior. */
export interface PastAction extends Action {
  night: number;
}

export interface GameState {
  players: PlayerId[];
  /** Noite a resolver, de 1 a 9. A última conta a dobrar (RULES.md §1). */
  night: number;
  /**
   * Ações das noites ANTERIORES (não incluir a noite atual), com a noite. Servem para as quotas e para
   * não atacar a mesma pessoa duas noites seguidas (RULES.md §2).
   */
  pastActions: PastAction[];
}

/** Salário de cada ciclo: os pontos de um jogador são `SALARY + soma do ledger` (RULES.md §1). */
export const SALARY = 50;
/** Pontos por ataque (RULES.md §1). */
export const POINTS = 10;
/** Bónus de casa (RULES.md §1). */
export const HOME_BONUS = 2;
/** Assalto à casa vazia: o que perde o alvo fora e o que dividem os atacantes, sem bomba (RULES.md §3, caso 1). */
export const BURGLARY_POINTS = 5;
/** O que perde quem ataca um jogador que se defendeu (RULES.md §3, caso 2). */
export const DEFENDED_COST = { ATTACK: 5, BOMB: 10 } as const;

export const ACTION_TYPES: readonly ActionType[] = ['STAY', 'DEFEND', 'ATTACK', 'BOMB', 'VANISH'];

/** Ações com quota. STAY é ilimitado e por isso fica de fora (e tudo continua serializável em JSON). */
export type LimitedActionType = Exclude<ActionType, 'STAY'>;

/** Quotas por jogo (RULES.md §2). */
export const QUOTAS: Record<LimitedActionType, number> = {
  DEFEND: 2,
  ATTACK: 3,
  BOMB: 1,
  VANISH: 2,
};

export type LedgerReason =
  | 'ATTACK_SUCCESS' // ataque bem-sucedido: único atacante (+10)
  | 'ATTACK_DRAW_WON' // ataque bem-sucedido: ganhou o sorteio (+10)
  | 'ATTACK_LOST_DRAW' // perdeu o sorteio (-10)
  | 'ATTACK_BOMBED' // atacante normal "morre" porque houve bomba no alvo (-10)
  | 'ATTACK_DEFENDED' // atacou quem se defendeu (-5)
  | 'ATTACK_BURGLARY' // assalto à casa vazia: parte dos 5, arredondada para baixo
  | 'ATTACK_AWAY_BOMBED' // alvo fora e com bomba: a bomba leva tudo (0)
  | 'BOMB_SUCCESS' // parte do bolo, também com o alvo fora
  | 'BOMB_DEFENDED' // bombardeou quem se defendeu (-10)
  | 'VICTIM' // atacado em casa sem defesa, sem bomba (-10)
  | 'BOMBED' // bombardeado, em casa ou fora (-10)
  | 'BURGLARY_VICTIM' // estava fora e assaltaram-lhe a casa, sem bomba (-5)
  | 'DEFENSE' // defendeu-se: +10 por cada atacante, uma linha por apanhado (targetId = quem apanhou)
  | 'HOME_BONUS'; // em casa e não foi alvo (+2)

export interface LedgerEntry {
  playerId: PlayerId;
  /** Já multiplicado por 2 na última noite. */
  delta: number;
  reason: LedgerReason;
  /**
   * Razões `ATTACK_*` e `BOMB_*`: alvo da Visita ou Reunião do próprio jogador. Serve o confronto direto (RULES.md §5).
   * `DEFENSE`: o atacante que o jogador apanhou (só ele o sabe, RULES.md §4).
   */
  targetId?: PlayerId;
}

/** Resumo público de um jogador numa noite: só em casa ou fora, nunca a ação (RULES.md §4). */
export interface PlayerNightSummary {
  playerId: PlayerId;
  location: 'HOME' | 'AWAY';
}

/**
 * Resumo público de uma noite (RULES.md §4): casa/fora de cada jogador e quem foi apanhado.
 * Nada mais: nem ataques recebidos, defesas, sorteios, bombas, assaltos, bónus ou pontos.
 * O que aconteceu a cada um é privado e vem do seu próprio ledger.
 */
export interface NightSummary {
  players: PlayerNightSummary[];
  /** Atacantes apanhados por uma Segurança, sem dizer em que casa. Ordenados. */
  caught: PlayerId[];
}

export interface NightResult {
  ledger: LedgerEntry[];
  summary: NightSummary;
}
