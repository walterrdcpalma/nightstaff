// Lógica pura do ecrã Hoje: fase do dia, prazo das 23:59 e textos. Testada em today.test.ts.
import { addDays, cycleDay, lisbonDate } from '../../../engine/index.ts';
import type { ActionType, ValidationError } from '../../../engine/index.ts';

export type GameStatus = 'prep' | 'running' | 'finished';

export type TodayPhase =
  | { kind: 'PREP' } // dia 1: entrar ou sair
  | { kind: 'NIGHT'; night: number } // dias 2 a 10: escolher a ação
  | { kind: 'RESULTS' } // dia 11
  | { kind: 'WAKING' }; // entre as 00:00 e a passagem da resolve-night (ou ciclo adiado/seguinte a chegar)

/**
 * O que o ecrã Hoje mostra, a partir do estado gravado e da data de Lisboa.
 * Se a data e o estado não baterem (a resolve-night ainda não passou), o bairro "está a acordar".
 */
export function todayPhase(startDate: string, status: GameStatus, today: string): TodayPhase {
  const day = cycleDay(startDate, today);
  if (status === 'prep') return day === 1 ? { kind: 'PREP' } : { kind: 'WAKING' };
  if (status === 'running') return day >= 2 && day <= 10 ? { kind: 'NIGHT', night: day - 1 } : { kind: 'WAKING' };
  return day === 11 ? { kind: 'RESULTS' } : { kind: 'WAKING' };
}

/** Próximas 00:00 de Lisboa depois de `now`: o fim do prazo das 23:59 (RULES.md §2). Trata a mudança de hora. */
export function nextLisbonMidnight(now: Date): Date {
  const tomorrow = addDays(lisbonDate(now), 1);
  // Lisboa está a UTC+0 ou UTC+1: as 00:00 de amanhã são uma destas duas horas UTC.
  for (const offsetHours of [1, 0]) {
    const candidate = new Date(Date.parse(`${tomorrow}T00:00:00Z`) - offsetHours * 3_600_000);
    if (lisbonDate(candidate) === tomorrow && lisbonDate(new Date(candidate.getTime() - 1)) !== tomorrow) return candidate;
  }
  throw new Error(`Sem meia-noite em Lisboa para ${tomorrow}`);
}

/** `HH:MM:SS` até ao prazo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Nomes na app (RULES.md §2). Os códigos ficam só no código. */
export const ACTION_NAMES: Record<ActionType, string> = {
  STAY: '🏠 Folga',
  DEFEND: '🛡️ Segurança',
  ATTACK: '🗡️ Visita surpresa',
  BOMB: '💣 Reunião de emergência',
  VANISH: '🫥 Desaparecer',
};

/** Texto da escolha feita, ex.: "🗡️ Visita surpresa a Bruno". */
export function choiceText(type: ActionType, targetName?: string): string {
  return targetName ? `${ACTION_NAMES[type]} a ${targetName}` : ACTION_NAMES[type];
}

/** Erros do `validateAction` e do trigger da BD (T3), em português de Portugal. */
export const ERROR_TEXT: Record<ValidationError | 'NIGHT_CLOSED' | 'KEY_CHANGED', string> = {
  UNKNOWN_PLAYER: 'Não estás inscrito neste ciclo.',
  UNKNOWN_TYPE: 'Essa ação não existe.',
  TARGET_REQUIRED: 'Escolhe a casa de alguém.',
  UNEXPECTED_TARGET: 'Essa ação não tem alvo.',
  SELF_TARGET: 'Não podes ir a tua própria casa.',
  UNKNOWN_TARGET: 'Essa pessoa não está neste ciclo.',
  SAME_TARGET: 'Não podes ir à mesma casa duas noites seguidas.',
  QUOTA_EXHAUSTED: 'Já gastaste essa ação neste ciclo.',
  NIGHT_CLOSED: 'O prazo desta noite já fechou.',
  KEY_CHANGED: 'Não se pode mudar a noite de uma escolha.',
};

/** Mensagem para um erro da BD ou da validação: o código, se for conhecido. */
export function errorText(message: string): string {
  return message in ERROR_TEXT ? ERROR_TEXT[message as keyof typeof ERROR_TEXT] : 'Algo correu mal. Tenta outra vez.';
}

export interface TargetOption {
  id: string;
  name: string;
  /** Alvo da minha Visita ou Reunião de ontem: não o posso atacar esta noite (RULES.md §2). */
  blocked: boolean;
}

/** Alvos possíveis esta noite: todos menos eu, com o de ontem bloqueado. */
export function targetOptions(players: { id: string; name: string }[], me: string, lastTarget: string | null): TargetOption[] {
  return players.filter((p) => p.id !== me).map((p) => ({ id: p.id, name: p.name, blocked: p.id === lastTarget }));
}

/** Motivo do alvo bloqueado, para mostrar no botão. */
export const BLOCKED_TARGET_TEXT = 'foste lá ontem: só depois de uma noite sem ir';
