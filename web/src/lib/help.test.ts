import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, BURGLARY_POINTS, DEFENDED_COST, HOME_BONUS, NIGHTS, POINTS, QUOTAS, SALARY } from '../../../engine/index.ts';
import type { LedgerReason } from '../../../engine/index.ts';
import {
  CONTEXT_HELP,
  REPORT_MEANING,
  SECTION_IDS,
  TERMS,
  actionName,
  helpActions,
  helpElementId,
  helpFaq,
  helpSections,
  helpTextInOrder,
  outcomeTable,
} from './help.ts';
import type { HelpTerm } from './help.ts';
import { REASON_TEXT } from './night.ts';
import { ACTION_NAMES } from './today.ts';

/** Todo o texto da ajuda, como o jogador o lê. */
const allText = () => helpTextInOrder().join('\n');
const answer = (q: string) => helpFaq().find((f) => f.question.startsWith(q))!.answer.join(' ');
const section = (id: string) => helpSections().find((s) => s.id === id)!;

describe('ajuda: ordem das secções (T21)', () => {
  it('A ideia → O que posso fazer → O que acontece → Prazo → Quem vê o quê → Salas → Dicas', () => {
    expect(helpSections().map((s) => s.id)).toEqual([...SECTION_IDS]);
    expect(helpSections().map((s) => s.title)).toEqual([
      '🌙 A ideia',
      '🎬 O que posso fazer',
      '💰 O que acontece',
      '⏰ Prazo',
      '👀 Quem vê o quê',
      '🚪 Salas',
      '💡 Dicas',
    ]);
  });

  it('as ações estão em "O que posso fazer" e a tabela em "O que acontece"', () => {
    expect(section('actions').actions).toHaveLength(5);
    expect(section('outcomes').table!.length).toBeGreaterThan(0);
    for (const s of helpSections()) {
      if (s.id !== 'actions') expect(s.actions).toBeUndefined();
      if (s.id !== 'outcomes') expect(s.table).toBeUndefined();
    }
  });

  it('a secção Dicas tem 4 a 6 linhas', () => {
    const tips = section('tips');
    expect(tips.intro.length + tips.outro.length).toBeGreaterThanOrEqual(4);
    expect(tips.intro.length + tips.outro.length).toBeLessThanOrEqual(6);
  });
});

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

  it('sem "atacar", "ataque" nem "bater à porta" soltos (só o termo "ataques bem-sucedidos" do desempate)', () => {
    const text = allText().replace(/ataques bem-sucedidos/g, '');
    expect(text).not.toMatch(/\batac|\bataque|bater à porta|baterem à porta/i);
  });

  it('plurais certos: "Visitas surpresa" e "Despedimentos coletivos"', () => {
    const text = allText();
    expect(text).toContain('Visitas surpresa');
    expect(text).toContain('Despedimentos coletivos');
    expect(text).not.toMatch(/Visita surpresas|Despedimento coletivos/);
  });
});

describe('ajuda: termos definidos na primeira vez que aparecem', () => {
  const patterns: Record<HelpTerm, RegExp> = {
    quota: /\bquota/i,
    sorteio: /\bsorteio/i,
    assalto: /\bassalt/i,
    apanhado: /\bapanhad/i,
    bolo: /\bbolo\b/i,
  };

  it.each(Object.keys(patterns) as HelpTerm[])('%s', (term) => {
    const first = helpTextInOrder().find((t) => patterns[term].test(t));
    expect(first).toBeDefined();
    expect(first).toContain(TERMS[term]);
  });

  it('o bolo explica-se com as contas', () => {
    const text = section('outcomes').outro.join(' ');
    expect(text).toContain(`O bolo é ${POINTS} da Ana + ${POINTS} do Bruno = ${POINTS * 2}`);
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

  it('a tabela faz as contas do RULES.md §3', () => {
    const rows = outcomeTable().map((r) => `${r.action} | ${r.target} | ${r.result}`);
    const row = (re: RegExp) => rows.find((r) => re.test(r))!;
    expect(row(/só tu lá vais/)).toContain(`Tu +${POINTS}, o dono −${POINTS}`);
    expect(row(/há mais Visitas/)).toContain(`quem ganha +${POINTS}, o dono −${POINTS} e cada um dos outros −${POINTS}`);
    expect(row(/Visita surpresa \| Fora/)).toContain(`o dono −${BURGLARY_POINTS}, e quem lá foi divide ${BURGLARY_POINTS}`);
    expect(row(/Visita surpresa \| Com Segurança/)).toContain(`Tu −${DEFENDED_COST.ATTACK}, o dono +${POINTS}`);
    expect(row(/Despedimento coletivo nessa casa/)).toContain(`tu −${POINTS}; com o dono fora, 0`);
    expect(row(/Despedimento coletivo \| Em casa ou fora/)).toContain(`O dono −${POINTS}`);
    expect(row(/Despedimento coletivo \| Com Segurança/)).toContain(`Tu −${DEFENDED_COST.BOMB}, o dono +${POINTS}`);
  });

  it('bónus de casa e noite 9 a dobrar ficam em duas linhas à parte, depois da tabela', () => {
    const outro = section('outcomes').outro;
    expect(outro.filter((p) => p.includes(`+${HOME_BONUS}`) && p.includes('Bónus de casa'))).toHaveLength(1);
    expect(outro.filter((p) => p.includes(`noite ${NIGHTS} conta a dobrar`))).toHaveLength(1);
  });

  it('salário e noites', () => {
    const text = allText();
    expect(text).toContain(`salário de ${SALARY} pontos`);
    expect(text).toContain(`${NIGHTS} noites`);
  });

  it('o que só tu vês inclui o bónus de casa (RULES.md §4)', () => {
    expect(allText()).toContain('se ganhaste o bónus de casa');
  });

  it('a sala contra bots apaga-se quando quiseres (RULES.md §1.2 v8)', () => {
    expect(answer('Como funciona uma sala contra bots?')).toContain('🗑️ Apagar sala');
  });

  it('os cenários das perguntas fazem as contas do RULES.md §3', () => {
    // Duas Visitas: sorteio, Segurança (+10 por cada) ou assalto dividido e arredondado para baixo.
    expect(answer('O Bruno e a Carla')).toContain(`Ana +${POINTS} por cada um = +${POINTS * 2}`);
    expect(answer('O Bruno e a Carla')).toContain(`+${Math.floor(BURGLARY_POINTS / 2)} cada`);
    // Despedimento com uma Visita no mesmo alvo em casa: bolo de 10 + 10, com as contas.
    expect(answer('Para que serve o Despedimento')).toContain(`${POINTS} da Ana + ${POINTS} do Bruno: Carla +${POINTS * 2}`);
    expect(answer('Para que serve o Despedimento')).toContain(`a quota é ${QUOTAS.BOMB} por partida`);
    // Pontos negativos: um exemplo direto, e a conta bate certo.
    expect(answer('Porque tenho pontos negativos')).toContain(`${SALARY} − 6 × ${POINTS} = ${SALARY - 6 * POINTS}.`);
    expect(SALARY - 6 * POINTS).toBeLessThan(0);
  });
});

describe('ajuda: perguntas', () => {
  it('estão as da T13 e as novas da T21, sem repetidas', () => {
    const questions = helpFaq().map((q) => q.question);
    expect(new Set(questions).size).toBe(questions.length);
    for (const q of [
      'O Bruno e a Carla fazem uma Visita surpresa à Ana na mesma noite. O que acontece?',
      'Fiz uma Visita surpresa a quem estava fora. E agora?',
      'O que acontece a quem vai a casa de alguém com Segurança?',
      'Para que serve o Despedimento coletivo e porque só o posso usar uma vez?',
      'Para que serve o Desaparecer?',
      'Posso ir à mesma casa duas noites seguidas?',
      'Não escolhi nada. E agora?',
      'Posso mudar a escolha?',
      'Porque tenho pontos negativos?',
      'Quem vê as minhas ações?',
      'Como se desempata?',
      'Como funciona uma sala contra bots?',
      // T21
      'O admin começou a partida tarde. Quando termina a noite 1?',
      'Posso sair da sala depois de Começar?',
      'O que acontece se o admin sair da sala?',
      'No Bairro, o que querem dizer a janela acesa, a escura e a sirene?',
      'Porque é que o Começar está desligado?',
      'O que quer dizer cada linha do meu relatório da manhã?',
    ]) {
      expect(questions).toContain(q);
    }
    for (const q of helpFaq()) expect(q.answer.length).toBeGreaterThan(0);
  });

  it('a noite 1 acaba às 23:59 do dia do Começar (RULES.md §1.1)', () => {
    expect(answer('O admin começou a partida tarde')).toContain('Às 23:59 desse mesmo dia');
  });

  it('o relatório explica cada linha que o jogador pode ver', () => {
    const report = helpFaq().find((q) => q.id === 'report')!.answer;
    for (const r of Object.keys(REASON_TEXT) as LedgerReason[]) {
      expect(report).toContain(`${REASON_TEXT[r]}: ${REPORT_MEANING[r]}`);
    }
  });
});

describe('ajuda contextual (âncoras)', () => {
  const ids = [...helpSections().map((s) => s.id), ...helpFaq().flatMap((q) => (q.id ? [q.id] : []))];

  it('as âncoras são únicas', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada "?" abre numa secção ou pergunta que existe', () => {
    for (const anchor of Object.values(CONTEXT_HELP)) expect(ids).toContain(anchor);
  });

  it('cada "?" vai ao sítio certo', () => {
    expect(CONTEXT_HELP).toEqual({
      cards: 'actions',
      deadline: 'deadline',
      report: 'report',
      building: 'building',
      lobby: 'start',
      points: 'tiebreak',
    });
  });

  it('o id do elemento vem da âncora', () => {
    expect(helpElementId('tiebreak')).toBe('help-tiebreak');
  });
});
