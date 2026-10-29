import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, BURGLARY_POINTS, DEFENDED_COST, HOME_BONUS, NIGHTS, POINTS, QUOTAS, SALARY } from '../../../engine/index.ts';
import { actionName, helpActions, helpFaq, helpSections } from './help.ts';
import { ACTION_NAMES } from './today.ts';

/** Todo o texto da ajuda, como o jogador o lê. */
const allText = () =>
  [
    ...helpSections().flatMap((s) => [s.title, ...s.paragraphs]),
    ...helpActions().flatMap((a) => [a.name, a.quota, a.text]),
    ...helpFaq().flatMap((q) => [q.question, ...q.answer]),
  ].join('\n');

describe('ajuda: nomes (RULES.md §2)', () => {
  it('todas as ações aparecem com o nome da app', () => {
    const text = allText();
    for (const t of ACTION_TYPES) {
      expect(text).toContain(ACTION_NAMES[t]);
      expect(text).toContain(actionName(t));
    }
    expect(actionName('BOMB')).toBe('Despedimento coletivo');
  });

  it('nenhum código das ações chega ao texto', () => {
    expect(allText()).not.toMatch(/\b(STAY|DEFEND|ATTACK|BOMB|VANISH)\b/);
  });
});

describe('ajuda: números (vêm do engine/)', () => {
  it('cada ação tem a quota do engine/ e diz se deixa em casa ou fora', () => {
    const actions = helpActions();
    expect(actions.map((a) => a.name)).toEqual(ACTION_TYPES.map((t) => ACTION_NAMES[t]));
    for (const [i, t] of ACTION_TYPES.entries()) {
      expect(actions[i].quota).toBe(t === 'STAY' ? '∞' : `${QUOTAS[t]} por partida`);
      expect(actions[i].home).toBe(t === 'STAY' || t === 'DEFEND');
    }
  });

  it('salário, noites, pontos por ataque, assalto, custos da Segurança e bónus', () => {
    const text = allText();
    expect(text).toContain(`salário de ${SALARY} pontos`);
    expect(text).toContain(`${NIGHTS} noites`);
    expect(text).toContain(`ganhas ${POINTS} e a pessoa perde ${POINTS}`);
    expect(text).toContain(`o dono perde ${BURGLARY_POINTS} e os atacantes dividem ${BURGLARY_POINTS}`);
    expect(text).toContain(`custa-te ${DEFENDED_COST.ATTACK}`);
    expect(text).toContain(`custa-te ${DEFENDED_COST.BOMB}`);
    expect(text).toContain(`+${HOME_BONUS}`);
    expect(text).toContain(`A noite ${NIGHTS} conta a dobrar`);
  });

  it('os cenários das perguntas fazem as contas do RULES.md §3', () => {
    const answer = (q: string) => helpFaq().find((f) => f.question.startsWith(q))!.answer.join(' ');
    // Dois atacantes: sorteio, defesa (+10 por atacante) ou assalto dividido e arredondado para baixo.
    expect(answer('O Bruno e a Carla')).toContain(`Ana +${POINTS * 2}`);
    expect(answer('O Bruno e a Carla')).toContain(`+${Math.floor(BURGLARY_POINTS / 2)} cada`);
    // Despedimento com uma Visita no mesmo alvo em casa: bolo de 10 + 10.
    expect(answer('Para que serve o Despedimento')).toContain(`Carla +${POINTS + POINTS}`);
    expect(answer('Para que serve o Despedimento')).toContain(`a quota é ${QUOTAS.BOMB} por partida`);
    // Pontos negativos: a conta bate certo.
    expect(answer('Porque tenho pontos negativos')).toMatch(new RegExp(`= ${SALARY - POINTS * (SALARY / POINTS + 1)}\\.`));
  });
});

describe('ajuda: perguntas', () => {
  it('estão todas as da T13, sem repetidas', () => {
    const questions = helpFaq().map((q) => q.question);
    expect(new Set(questions).size).toBe(questions.length);
    for (const q of [
      'O Bruno e a Carla atacam a Ana ao mesmo tempo. O que acontece?',
      'Ataquei alguém que estava fora. E agora?',
      'O que acontece se atacarem alguém com Segurança?',
      'Para que serve o Despedimento coletivo e porque só o posso usar uma vez?',
      'Para que serve o Desaparecer?',
      'Posso atacar a mesma pessoa duas noites seguidas?',
      'Não escolhi nada. E agora?',
      'Posso mudar a escolha?',
      'Porque tenho pontos negativos?',
      'Quem vê as minhas ações?',
      'Como se desempata?',
      'Como funciona uma sala contra bots?',
    ]) {
      expect(questions).toContain(q);
    }
    for (const q of helpFaq()) expect(q.answer.length).toBeGreaterThan(0);
  });
});
