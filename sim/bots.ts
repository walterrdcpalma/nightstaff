import {
  ACTION_TYPES,
  BURGLARY_POINTS,
  DEFENDED_COST,
  HOME_BONUS,
  NIGHTS,
  POINTS,
  QUOTAS,
  previousTarget,
  randomIndex,
  remainingQuota,
} from '../engine/index.ts';
import type { Action, ActionType, GameState, LimitedActionType, NightSummary, PlayerId } from '../engine/index.ts';

/** O que um jogador sabe numa noite: o resumo público das noites anteriores e as suas quotas. */
export interface BotView {
  me: PlayerId;
  players: PlayerId[];
  /** Noite atual, de 1 a `nights`. */
  night: number;
  nights: number;
  history: NightSummary[];
  quota: Record<LimitedActionType, number>;
  /** O meu alvo da noite anterior: não o posso atacar esta noite (RULES.md §2). */
  lastTarget: PlayerId | null;
}

export type Bot = (view: BotView, rng: () => number) => Action;

const available = (v: BotView): ActionType[] => ACTION_TYPES.filter((t) => t === 'STAY' || v.quota[t] > 0);
const othersOf = (v: BotView) => v.players.filter((p) => p !== v.me);
/** Alvos permitidos esta noite: todos menos eu e o meu alvo da noite anterior. */
const targetsOf = (v: BotView) => othersOf(v).filter((p) => p !== v.lastTarget);

/** Escolhe uma ação disponível ao calhas e, se precisar, um alvo ao calhas. */
export const randomBot: Bot = (v, rng) => {
  const targets = targetsOf(v);
  const types = available(v).filter((t) => targets.length > 0 || (t !== 'ATTACK' && t !== 'BOMB'));
  const type = types[randomIndex(rng, types.length)];
  if (type !== 'ATTACK' && type !== 'BOMB') return { playerId: v.me, type };
  return { playerId: v.me, type, targetId: targets[randomIndex(rng, targets.length)] };
};

/** Custo máximo de gastar agora uma unidade de quota que ainda podia ser usada mais tarde. */
const RESERVE = 3;
/** Ruído uniforme [0, NOISE) somado a cada opção. Afinados com o simulador (ver PR). */
const NOISE = 6;

/**
 * Lê o histórico público (só casa/fora e apanhados, RULES.md §4) e escolhe a ação com maior valor
 * esperado, com algum ruído para os bots espertos não escolherem todos o mesmo alvo. Cada noite fora
 * é uma Visita, Reunião ou Desaparecer gasta. Daí estima, para cada adversário:
 * - saídas que lhe restam (3 + 1 + 2 − noites fora) e P(fora) = saídas a dividir pelas noites que faltam;
 * - P(defende): as defesas não são públicas, por isso usa a quota espalhada pelo ciclo;
 * - atacantes esperados em cada alvo = soma de P(fora) dos outros, na parte que são ataques, com alvo uniforme.
 * Sair de casa também tem risco: se alguém me atacar, assalta-me a casa vazia, e uma bomba acerta na mesma.
 * Desaparecer serve para fugir a um ataque em casa (-10) a troco do risco de fora e de não ter bónus.
 */
export const smartBot: Bot = (v, rng) => {
  const nightsLeft = v.nights - v.night + 1;
  const awayNights = (p: PlayerId) =>
    v.history.filter((n) => n.players.find((s) => s.playerId === p)!.location === 'AWAY').length;

  const others = othersOf(v);
  const outings = QUOTAS.ATTACK + QUOTAS.BOMB + QUOTAS.VANISH;
  const pAway = new Map(others.map((p) => [p, Math.min(1, Math.max(0, outings - awayNights(p)) / nightsLeft)]));
  const pDefend = (p: PlayerId) => Math.min(1 - pAway.get(p)!, QUOTAS.DEFEND / v.nights);
  /** Parte das saídas que são ataques (Visita ou Reunião), e destes a parte que são Reuniões. */
  const attackShare = (QUOTAS.ATTACK + QUOTAS.BOMB) / outings;
  const bombShare = QUOTAS.BOMB / (QUOTAS.ATTACK + QUOTAS.BOMB);
  /** Atacantes esperados em `t` vindos de jogadores que não sou eu nem `t`. */
  const expectedAttackers = (t: PlayerId) =>
    others.filter((o) => o !== t).reduce((sum, o) => sum + (pAway.get(o)! * attackShare) / (v.players.length - 1), 0);

  const lambdaMe = others.reduce((sum, o) => sum + (pAway.get(o)! * attackShare) / (v.players.length - 1), 0);
  const pAttacked = 1 - Math.exp(-lambdaMe);
  // Fora de casa, uma bomba acerta na mesma (−POINTS); sem bomba, um assalto custa BURGLARY_POINTS.
  const pBombed = 1 - Math.exp(-lambdaMe * bombShare);
  const pBurgled = (1 - pBombed) * (1 - Math.exp(-lambdaMe * (1 - bombShare)));
  const awayRisk = pBombed * POINTS + pBurgled * BURGLARY_POINTS;

  // Gastar quota agora tira a hipótese de a usar mais tarde; só deixa de custar quando sobra quota.
  const reserve = (t: LimitedActionType) => (v.quota[t] >= nightsLeft ? 0 : RESERVE * (1 - v.quota[t] / nightsLeft));
  const noise = () => rng() * NOISE;

  const options: { action: Action; score: number }[] = [
    { action: { playerId: v.me, type: 'STAY' }, score: (1 - pAttacked) * HOME_BONUS - pAttacked * POINTS + noise() },
  ];
  if (v.quota.DEFEND > 0) {
    const ev = (1 - pAttacked) * HOME_BONUS + lambdaMe * POINTS;
    options.push({ action: { playerId: v.me, type: 'DEFEND' }, score: ev - reserve('DEFEND') + noise() });
  }
  if (v.quota.VANISH > 0) {
    options.push({ action: { playerId: v.me, type: 'VANISH' }, score: -awayRisk - reserve('VANISH') + noise() });
  }
  for (const t of targetsOf(v)) {
    const pDef = pDefend(t);
    const pStay = 1 - pAway.get(t)! - pDef;
    const k = expectedAttackers(t);
    if (v.quota.ATTACK > 0) {
      // Com K ~ Poisson(k) outros atacantes, P(ganhar o sorteio) = E[1/(1+K)] = (1 − e^−k)/k.
      // A mesma fração dá a minha parte do assalto, se o alvo estiver fora.
      const pWin = k === 0 ? 1 : (1 - Math.exp(-k)) / k;
      const ev =
        pStay * POINTS * (2 * pWin - 1) + pAway.get(t)! * BURGLARY_POINTS * pWin - pDef * DEFENDED_COST.ATTACK - awayRisk;
      options.push({ action: { playerId: v.me, type: 'ATTACK', targetId: t }, score: ev - reserve('ATTACK') + noise() });
    }
    if (v.quota.BOMB > 0) {
      // A bomba também acerta em quem está fora, mas aí o bolo é só POINTS.
      const ev = pStay * POINTS * (1 + k) + pAway.get(t)! * POINTS - pDef * DEFENDED_COST.BOMB - awayRisk;
      options.push({ action: { playerId: v.me, type: 'BOMB', targetId: t }, score: ev - reserve('BOMB') + noise() });
    }
  }

  return options.reduce((best, o) => (o.score > best.score ? o : best)).action;
};

export const BOTS = { random: randomBot, smart: smartBot } as const;
export type BotKind = keyof typeof BOTS;

/**
 * Ações ao calhas dos bots `who` numa noite de uma sala contra bots (RULES.md §1.2), a partir do estado
 * validado da partida (`prepareNight`): respeitam as quotas, os alvos e a regra de não repetir o alvo.
 */
export function randomTurn(state: GameState, who: PlayerId[], rng: () => number): Action[] {
  return who.map((me) =>
    randomBot(
      {
        me,
        players: state.players,
        night: state.night,
        nights: NIGHTS,
        history: [],
        quota: remainingQuota(state, me),
        lastTarget: previousTarget(state, me),
      },
      rng,
    ),
  );
}
