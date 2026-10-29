import { ACTION_TYPES, DEFENDED_COST, HOME_BONUS, POINTS, QUOTAS, randomIndex } from '../engine/index.ts';
import type { Action, ActionType, LimitedActionType, NightSummary, PlayerId, PlayerNightSummary } from '../engine/index.ts';

/** O que um jogador sabe numa noite: o resumo público das noites anteriores e as suas quotas. */
export interface BotView {
  me: PlayerId;
  players: PlayerId[];
  /** Noite atual, de 1 a `nights`. */
  night: number;
  nights: number;
  history: NightSummary[];
  quota: Record<LimitedActionType, number>;
}

export type Bot = (view: BotView, rng: () => number) => Action;

const available = (v: BotView): ActionType[] => ACTION_TYPES.filter((t) => t === 'STAY' || v.quota[t] > 0);
const othersOf = (v: BotView) => v.players.filter((p) => p !== v.me);

/** Escolhe uma ação disponível ao calhas e, se precisar, um alvo ao calhas. */
export const randomBot: Bot = (v, rng) => {
  const types = available(v);
  const type = types[randomIndex(rng, types.length)];
  if (type === 'STAY' || type === 'DEFEND') return { playerId: v.me, type };
  const others = othersOf(v);
  return { playerId: v.me, type, targetId: others[randomIndex(rng, others.length)] };
};

/** Custo máximo de gastar agora uma unidade de quota que ainda podia ser usada mais tarde. */
const RESERVE = 3;
/** Ruído uniforme [0, NOISE) somado a cada opção. Afinados com o simulador (ver PR). */
const NOISE = 6;

/**
 * Lê o histórico público e escolhe a ação com maior valor esperado, com algum ruído para os bots
 * espertos não escolherem todos o mesmo alvo. O resumo diz quem esteve fora, e cada noite fora é
 * uma Visita ou Reunião gasta. Daí estima, para cada adversário:
 * - saídas que lhe restam (3 + 1 − noites fora) e defesas que lhe podem restar (2 − defesas reveladas);
 * - P(fora) e P(defende) = o que lhe resta a dividir pelas noites que faltam (gastar tudo até ao fim);
 * - atacantes esperados em cada alvo = soma de P(fora) dos outros, com alvo uniforme.
 */
export const smartBot: Bot = (v, rng) => {
  const nightsLeft = v.nights - v.night + 1;
  const seen = (p: PlayerId): PlayerNightSummary[] =>
    v.history.map((n) => n.players.find((s) => s.playerId === p)!);
  const count = (p: PlayerId, f: (s: PlayerNightSummary) => boolean) => seen(p).filter(f).length;

  const others = othersOf(v);
  const awayLeft = (p: PlayerId) => QUOTAS.ATTACK + QUOTAS.BOMB - count(p, (s) => s.location === 'AWAY');
  const pAway = new Map(others.map((p) => [p, Math.min(1, awayLeft(p) / nightsLeft)]));
  const pDefend = (p: PlayerId) =>
    Math.min(1 - pAway.get(p)!, (QUOTAS.DEFEND - count(p, (s) => s.defended)) / nightsLeft);
  /** Atacantes esperados em `t` vindos de jogadores que não sou eu nem `t`. */
  const expectedAttackers = (t: PlayerId) =>
    others.filter((o) => o !== t).reduce((sum, o) => sum + pAway.get(o)! / (v.players.length - 1), 0);

  const lambdaMe = others.reduce((sum, o) => sum + pAway.get(o)! / (v.players.length - 1), 0);
  const pAttacked = 1 - Math.exp(-lambdaMe);

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
  for (const t of others) {
    const pDef = pDefend(t);
    const pStay = 1 - pAway.get(t)! - pDef;
    const k = expectedAttackers(t);
    if (v.quota.ATTACK > 0) {
      // Com K ~ Poisson(k) outros atacantes, P(ganhar o sorteio) = E[1/(1+K)] = (1 − e^−k)/k.
      const pWin = k === 0 ? 1 : (1 - Math.exp(-k)) / k;
      const ev = pStay * POINTS * (2 * pWin - 1) - pDef * DEFENDED_COST.ATTACK;
      options.push({ action: { playerId: v.me, type: 'ATTACK', targetId: t }, score: ev - reserve('ATTACK') + noise() });
    }
    if (v.quota.BOMB > 0) {
      // A bomba também acerta em quem está fora, mas aí o bolo é só POINTS.
      const ev = pStay * POINTS * (1 + k) + pAway.get(t)! * POINTS - pDef * DEFENDED_COST.BOMB;
      options.push({ action: { playerId: v.me, type: 'BOMB', targetId: t }, score: ev - reserve('BOMB') + noise() });
    }
  }

  return options.reduce((best, o) => (o.score > best.score ? o : best)).action;
};

export const BOTS = { random: randomBot, smart: smartBot } as const;
export type BotKind = keyof typeof BOTS;
