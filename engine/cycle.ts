// Datas de uma partida (RULES.md §1.1 v6). Funções puras: a data de "hoje" vem sempre de fora.

/** Noites por partida. */
export const NIGHTS = 9;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Converte `YYYY-MM-DD` num número de dias. Usa UTC só para contar dias: não há mudanças de hora. */
function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Data inválida (esperado YYYY-MM-DD): ${date}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new RangeError(`Data inexistente: ${date}`);
  return ms / DAY_MS;
}

/**
 * Noite que se escolhe em `today` numa partida cuja noite 1 é `startDate` (o dia em que o admin carregou em
 * Começar), ambos `YYYY-MM-DD` em Lisboa. Sem limites: dá 10 no dia a seguir à noite 9.
 */
export function nightOn(startDate: string, today: string): number {
  return dayNumber(today) - dayNumber(startDate) + 1;
}

/** `date` mais `days` dias, em `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
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
