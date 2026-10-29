// Fases do ciclo de 11 dias (RULES.md §1). Funções puras: a data de "hoje" vem sempre de fora.

/** Dias de um ciclo: 1 preparação + 9 noites + 1 resolução (RULES.md §1). */
export const CYCLE_DAYS = 11;
/** Noites por ciclo (dias 2 a 10). */
export const NIGHTS = 9;

export type CyclePhase =
  | { phase: 'PREP'; day: 1 }
  | { phase: 'NIGHT'; day: number; night: number }
  | { phase: 'RESULTS'; day: 11 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Converte `YYYY-MM-DD` num número de dias. Usa UTC só para contar dias: não há mudanças de hora. */
function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Data inválida (esperado YYYY-MM-DD): ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new RangeError(`Data inexistente: ${date}`);
  return ms / DAY_MS;
}

/** Dia do ciclo que começa em `startDate` (dia 1). Sem limites: dá 12 no dia a seguir à resolução. */
export function cycleDay(startDate: string, today: string): number {
  return dayNumber(today) - dayNumber(startDate) + 1;
}

/** `date` mais `days` dias, em `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Fase e dia do ciclo (RULES.md §1). `startDate` é o dia 1 (preparação) e `today` o dia atual,
 * ambos `YYYY-MM-DD` em hora de Lisboa (ver `lisbonDate`).
 * Fora do ciclo (antes do dia 1 ou depois do dia 11) lança erro: o ciclo seguinte é outro jogo.
 */
export function cyclePhase(startDate: string, today: string): CyclePhase {
  const day = cycleDay(startDate, today);
  if (day < 1 || day > CYCLE_DAYS) {
    throw new RangeError(`${today} está fora do ciclo que começa a ${startDate} (dia ${day})`);
  }
  if (day === 1) return { phase: 'PREP', day: 1 };
  if (day === CYCLE_DAYS) return { phase: 'RESULTS', day: CYCLE_DAYS };
  return { phase: 'NIGHT', day, night: day - 1 };
}

const lisbonFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data `YYYY-MM-DD` em Lisboa (Europe/Lisbon, RULES.md §1) de um instante. Trata a mudança de hora. */
export function lisbonDate(instant: Date): string {
  return lisbonFormat.format(instant);
}
