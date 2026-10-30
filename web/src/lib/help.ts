// Ajuda (T13, reescrita na T21): como funciona o jogo, para quem nunca ouviu falar dele. Dados puros, testados em
// help.test.ts. Os números vêm das constantes do engine/ e os nomes das ações do ACTION_NAMES (RULES.md §2): se
// mudarem, a ajuda muda sozinha. É estática: não lê nada da BD, por isso não revela nada privado.
import { BURGLARY_POINTS, DEFENDED_COST, HOME_BONUS, MIN_PLAYERS, NIGHTS, POINTS, QUOTAS, SALARY } from '../../../engine/index.ts';
import type { ActionType, LedgerReason } from '../../../engine/index.ts';
import { REASON_TEXT } from './night.ts';
import { BOTS_MAX, BOTS_MIN } from './rooms.ts';
import { ACTION_NAMES } from './today.ts';

/** Nome da ação sem o emoji, para usar no meio de uma frase: "Visita surpresa". */
export function actionName(t: ActionType): string {
  return ACTION_NAMES[t].replace(/^\S+\s/, '');
}

const FOLGA = actionName('STAY');
const SEGURANCA = actionName('DEFEND');
const VISITA = actionName('ATTACK');
const DESPEDIMENTO = actionName('BOMB');
const DESAPARECER = actionName('VANISH');
/** Plurais: "Visitas surpresa", "Despedimentos coletivos". */
const VISITAS = VISITA.replace(/^(\S+)/, '$1s');
const DESPEDIMENTOS = DESPEDIMENTO.split(' ').map((w) => `${w}s`).join(' ');

/** Secções da parte "Como funciona", por esta ordem. O id é a âncora da ajuda contextual. */
export const SECTION_IDS = ['idea', 'actions', 'outcomes', 'deadline', 'visibility', 'rooms', 'tips'] as const;
export type HelpSectionId = (typeof SECTION_IDS)[number];

/** Perguntas que têm âncora (ajuda contextual). As outras não precisam de id. */
export type FaqId = 'report' | 'building' | 'start' | 'tiebreak';

export type HelpAnchor = HelpSectionId | FaqId;

/** Id do elemento de uma âncora na Ajuda (para o scroll e para abrir a pergunta). */
export function helpElementId(anchor: HelpAnchor): string {
  return `help-${anchor}`;
}

/** Onde abre cada "?" da ajuda contextual (T21). */
export const CONTEXT_HELP = {
  /** Cartas do Hoje: as ações e a quota. */
  cards: 'actions',
  /** Contagem até às 23:59. */
  deadline: 'deadline',
  /** Relatório privado da Manhã: o que quer dizer cada linha. */
  report: 'report',
  /** Legenda do Bairro: janelas e sirene. */
  building: 'building',
  /** Lobby: porque é que o Começar está desligado. */
  lobby: 'start',
  /** Pontos: o desempate. */
  points: 'tiebreak',
} as const satisfies Record<string, HelpAnchor>;

/**
 * Termos do jogo, definidos na primeira vez que aparecem (o teste confirma-o). A definição entra tal e qual no
 * texto, por isso é uma frase curta que encaixa a seguir ao termo.
 */
export const TERMS = {
  quota: 'quantas vezes a podes escolher numa partida',
  sorteio: 'a sorte escolhe quem leva os pontos',
  assalto: 'o dono tinha saído e a casa estava vazia',
  apanhado: 'de manhã, o bairro inteiro sabe que foste apanhado, mas não em que casa',
  bolo: `os pontos que o dono e as ${VISITAS} nessa casa perdem`,
} as const;
export type HelpTerm = keyof typeof TERMS;

export interface HelpAction {
  name: string;
  /** "∞" ou "2 por partida". */
  quota: string;
  home: boolean;
  text: string;
}

/** Uma linha da tabela "O que acontece": o que faço, como está o dono da casa e o resultado. */
export interface HelpRow {
  action: string;
  target: string;
  result: string;
}

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  /** Antes da lista das ações ou da tabela. */
  intro: string[];
  /** Só em "O que posso fazer". */
  actions?: HelpAction[];
  /** Só em "O que acontece". */
  table?: HelpRow[];
  /** Depois da lista ou da tabela. */
  outro: string[];
}

export interface HelpQuestion {
  id?: FaqId;
  question: string;
  answer: string[];
}

const HOME_ACTIONS: ActionType[] = ['STAY', 'DEFEND'];

/** O que cada ação faz, numa frase ou duas (também nas cartas do Hoje, T18). */
export const ACTION_TEXT: Record<ActionType, string> = {
  STAY: `Ficas em casa a descansar. Se ninguém te aparecer à porta, ganhas o bónus de casa (+${HOME_BONUS}).`,
  DEFEND: `Ficas em casa de lanterna na mão. Quem te aparecer à porta perde pontos e fica à vista de todos de manhã, e tu ganhas ${POINTS} por cada um.`,
  ATTACK: `Vais a casa de alguém tirar-lhe ${POINTS} pontos. Se o dono tiver saído, rende menos: ${BURGLARY_POINTS}, a dividir por quem lá for.`,
  BOMB: `Vais a casa de alguém e tiras-lhe ${POINTS}, esteja em casa ou fora. Se o Bruno também lá for de ${VISITA}, não leva nada e, com o dono em casa, ainda perde ${POINTS}. Contra a ${SEGURANCA}, quem perde és tu.`,
  VANISH: `Sais de casa sem ir a casa de ninguém. Quem te aparecer à porta encontra a casa vazia e perdes menos. Não tens bónus de casa.`,
};

/** As cinco ações, pela ordem da app, com a quota e se deixam em casa ou fora (RULES.md §2). */
export function helpActions(): HelpAction[] {
  return (['STAY', 'DEFEND', 'ATTACK', 'BOMB', 'VANISH'] as ActionType[]).map((t) => ({
    name: ACTION_NAMES[t],
    quota: t === 'STAY' ? '∞' : `${QUOTAS[t]} por partida`,
    home: HOME_ACTIONS.includes(t),
    text: ACTION_TEXT[t],
  }));
}

/** "O que acontece" (RULES.md §3), uma linha por caso. "Tu" és quem vai; "o dono" é quem lá mora. */
export function outcomeTable(): HelpRow[] {
  return [
    {
      action: VISITA,
      target: `Em casa, de ${FOLGA}, e só tu lá vais`,
      result: `Tu +${POINTS}, o dono −${POINTS}.`,
    },
    {
      action: VISITA,
      target: `Em casa, de ${FOLGA}, e há mais ${VISITAS}`,
      result: `Sorteio (${TERMS.sorteio}): quem ganha +${POINTS}, o dono −${POINTS} e cada um dos outros −${POINTS}.`,
    },
    {
      action: VISITA,
      target: 'Fora',
      result: `Assalto (${TERMS.assalto}): o dono −${BURGLARY_POINTS}, e quem lá foi divide ${BURGLARY_POINTS}, arredondado para baixo.`,
    },
    {
      action: VISITA,
      target: `Com ${SEGURANCA}`,
      result: `Tu −${DEFENDED_COST.ATTACK}, o dono +${POINTS}. Ficas apanhado: ${TERMS.apanhado}.`,
    },
    {
      action: VISITA,
      target: `Há também um ${DESPEDIMENTO} nessa casa`,
      result: `Com o dono em casa, tu −${POINTS}; com o dono fora, 0. O ${DESPEDIMENTO} leva tudo.`,
    },
    {
      action: DESPEDIMENTO,
      target: `Em casa ou fora, sem ${SEGURANCA}`,
      result: `O dono −${POINTS}, e tu levas o bolo: ${TERMS.bolo}.`,
    },
    {
      action: DESPEDIMENTO,
      target: `Com ${SEGURANCA}`,
      result: `Tu −${DEFENDED_COST.BOMB}, o dono +${POINTS}, e ficas apanhado.`,
    },
  ];
}

/** Parte 1: como funciona, pela ordem de `SECTION_IDS`. */
export function helpSections(): HelpSection[] {
  return [
    {
      id: 'idea',
      title: '🌙 A ideia',
      intro: [
        `És do staff do bairro. Uma partida tem ${NIGHTS} noites e, todas as noites, escolhes o que fazes.`,
        `Começas com um salário de ${SALARY} pontos. No fim, quem tiver mais pontos é o 🏆 Funcionário do Mês.`,
        'Cada escolha deixa-te em casa ou fora. De manhã, o bairro inteiro sabe quem tinha a janela acesa e quem saiu, mas nunca o que cada um fez.',
      ],
      outro: [],
    },
    {
      id: 'actions',
      title: '🎬 O que posso fazer',
      intro: [
        `Uma ação por noite. Cada uma tem uma quota: ${TERMS.quota}. A ${FOLGA} não tem limite.`,
      ],
      actions: helpActions(),
      outro: ['A quota gasta-se sempre que escolhes a ação, corra bem ou mal.'],
    },
    {
      id: 'outcomes',
      title: '💰 O que acontece',
      intro: ['À meia-noite resolve-se tudo ao mesmo tempo. Na tabela, "tu" és quem vai a casa de alguém e "o dono" é quem lá mora.'],
      table: outcomeTable(),
      outro: [
        `Sorteio, com contas: a Ana está de ${FOLGA} e o Bruno e a Carla fazem-lhe uma ${VISITA}. Só um leva os ${POINTS}. Se sair o Bruno: Bruno +${POINTS}, Ana −${POINTS}, Carla −${POINTS}.`,
        `${DESPEDIMENTO} com bolo, com contas: a Ana está de ${FOLGA}, o Bruno faz-lhe uma ${VISITA} e a Carla um ${DESPEDIMENTO}. O bolo é ${POINTS} da Ana + ${POINTS} do Bruno = ${POINTS * 2}, e a Carla leva os ${POINTS * 2}. Se a Ana estivesse fora, o Bruno ficava com 0 e o bolo era só os ${POINTS} da Ana. Com dois ${DESPEDIMENTOS} na mesma casa, o bolo divide-se, arredondado para baixo.`,
        `✨ Bónus de casa: quem fica em casa (${FOLGA} ou ${SEGURANCA}) e não recebe ninguém à porta ganha +${HOME_BONUS}.`,
        `✖️2 A noite ${NIGHTS} conta a dobrar: todos os pontos dessa noite, bónus incluído.`,
      ],
    },
    {
      id: 'deadline',
      title: '⏰ Prazo',
      intro: [
        'Escolhes até às 23:59 e, até lá, podes mudar de ideias. Às 00:00 resolve-se tudo ao mesmo tempo.',
        `Quem não escolher fica de ${FOLGA}.`,
        `Não podes ir à mesma casa duas noites seguidas (${VISITA} ou ${DESPEDIMENTO}). Uma noite sem ir lá volta a permitir.`,
        'Numa sala contra bots não há relógio: a noite só acaba quando carregas em ⏭️ Passar o dia.',
      ],
      outro: [],
    },
    {
      id: 'visibility',
      title: '👀 Quem vê o quê',
      intro: [
        'Ninguém vê as ações dos outros: nem antes da meia-noite, nem depois.',
        `De manhã, todos sabem quem estava em casa e quem estava fora, e quem foi apanhado pela ${SEGURANCA} (sem dizer em que casa).`,
        `O resto só tu vês: se te fizeram uma ${VISITA} ou um ${DESPEDIMENTO} (sem saber quem), se ganhaste ou perdeste um sorteio, quem apanhaste com a ${SEGURANCA}, se ganhaste o bónus de casa e os teus pontos. O ranking completo só aparece no fim da partida.`,
      ],
      outro: [],
    },
    {
      id: 'rooms',
      title: '🚪 Salas',
      intro: [
        'Cria uma sala e partilha o código de 6 caracteres. Quem a cria é o admin.',
        `O admin carrega em Começar quando houver pelo menos ${MIN_PLAYERS} jogadores, e a noite 1 abre logo. Depois disso, ninguém entra nem sai.`,
        'No fim, o admin pode Reiniciar a sala: volta ao lobby com o mesmo código.',
        `Numa sala contra bots jogas contra ${BOTS_MIN} a ${BOTS_MAX} bots, e o dia só passa quando carregas em ⏭️ Passar o dia.`,
      ],
      outro: [],
    },
    {
      id: 'tips',
      title: '💡 Dicas',
      intro: [
        `A ${SEGURANCA} só tem ${QUOTAS.DEFEND} usos: guarda-a para as noites em que achas que te vão aparecer à porta.`,
        `O ${DESPEDIMENTO} só há ${QUOTAS.BOMB}. Acerta esteja o dono onde estiver, por isso não precisas de adivinhar se saiu.`,
        `Fora de casa (${VISITA}, ${DESPEDIMENTO} ou ${DESAPARECER}), uma ${VISITA} à tua porta custa-te ${BURGLARY_POINTS} em vez de ${POINTS}, mas perdes o bónus de casa.`,
        'O Bairro mostra quem costuma sair e quem fica: é a única pista pública que há.',
        `A noite ${NIGHTS} conta a dobrar: quem chega lá com quotas por gastar ainda pode dar a volta.`,
      ],
      outro: [],
    },
  ];
}

/** O que quer dizer cada linha do relatório privado da Manhã (as linhas vêm do REASON_TEXT do `night.ts`). */
export const REPORT_MEANING: Record<LedgerReason, string> = {
  ATTACK_SUCCESS: `foste o único a fazer uma ${VISITA} a essa casa e o dono estava de ${FOLGA}.`,
  ATTACK_DRAW_WON: `havia mais ${VISITAS} na mesma casa e o sorteio escolheu-te.`,
  ATTACK_LOST_DRAW: `havia mais ${VISITAS} na mesma casa e o sorteio escolheu outro.`,
  ATTACK_BOMBED: `alguém fez um ${DESPEDIMENTO} na mesma casa, com o dono lá: os teus pontos foram para o bolo.`,
  ATTACK_DEFENDED: `o dono tinha ${SEGURANCA}: ficaste apanhado.`,
  ATTACK_BURGLARY: 'o dono tinha saído: é a tua parte do assalto.',
  ATTACK_AWAY_BOMBED: `o dono tinha saído, mas um ${DESPEDIMENTO} na mesma casa levou tudo: ficas com 0.`,
  BOMB_SUCCESS: `o teu ${DESPEDIMENTO} acertou: é o bolo (ou a tua parte, se houve mais do que um).`,
  BOMB_DEFENDED: `o dono tinha ${SEGURANCA}: ficaste apanhado.`,
  VICTIM: `estavas em casa sem ${SEGURANCA} e alguém te fez uma ${VISITA}.`,
  BOMBED: `alguém te fez um ${DESPEDIMENTO}, estivesses onde estivesses.`,
  BURGLARY_VICTIM: 'tinhas saído e alguém te foi à casa vazia.',
  DEFENSE: `a tua ${SEGURANCA} apanhou essa pessoa: +${POINTS} por cada um.`,
  HOME_BONUS: 'ficaste em casa e ninguém te apareceu à porta.',
};

/** Parte 2: perguntas frequentes, cada uma com um mini-cenário e os pontos certos (RULES.md §3). */
export function helpFaq(): HelpQuestion[] {
  const half = Math.floor(BURGLARY_POINTS / 2);
  return [
    {
      question: `O Bruno e a Carla fazem uma ${VISITA} à Ana na mesma noite. O que acontece?`,
      answer: [
        `Se a Ana estiver em casa de ${FOLGA}, há sorteio. Se o Bruno ganhar: Bruno +${POINTS}, Ana −${POINTS}, Carla −${POINTS}.`,
        `Se a Ana tiver ${SEGURANCA}: Bruno −${DEFENDED_COST.ATTACK}, Carla −${DEFENDED_COST.ATTACK}, Ana +${POINTS} por cada um = +${POINTS * 2}, e os dois ficam apanhados.`,
        `Se a Ana estiver fora, é um assalto: Ana −${BURGLARY_POINTS}, e o Bruno e a Carla dividem ${BURGLARY_POINTS}: +${half} cada (${BURGLARY_POINTS} ÷ 2, arredondado para baixo).`,
      ],
    },
    {
      question: `Fiz uma ${VISITA} a quem estava fora. E agora?`,
      answer: [
        `É um assalto à casa vazia. Se foste só tu: tu +${BURGLARY_POINTS}, o dono −${BURGLARY_POINTS}. Com mais gente, dividem os ${BURGLARY_POINTS}.`,
        `Se alguém fez um ${DESPEDIMENTO} na mesma casa, o ${DESPEDIMENTO} leva tudo e tu ficas com 0.`,
      ],
    },
    {
      question: `O que acontece a quem vai a casa de alguém com ${SEGURANCA}?`,
      answer: [
        `O Bruno faz uma ${VISITA} à Ana, que tinha ${SEGURANCA}: Bruno −${DEFENDED_COST.ATTACK}, Ana +${POINTS}.`,
        `Com um ${DESPEDIMENTO} em vez da ${VISITA}: Bruno −${DEFENDED_COST.BOMB}, Ana +${POINTS}.`,
        'De manhã, o bairro fica a saber que o Bruno foi apanhado, mas não em que casa.',
      ],
    },
    {
      question: `Para que serve o ${DESPEDIMENTO} e porque só o posso usar uma vez?`,
      answer: [
        `É a ação mais forte: acerta mesmo em quem está fora e ganha às ${VISITAS} na mesma casa. Por isso a quota é ${QUOTAS.BOMB} por partida.`,
        `A Ana está em casa de ${FOLGA}; o Bruno faz uma ${VISITA} e a Carla um ${DESPEDIMENTO}. Não há sorteio: Ana −${POINTS}, Bruno −${POINTS}, e o bolo é ${POINTS} da Ana + ${POINTS} do Bruno: Carla +${POINTS * 2}.`,
        `Se a Ana estivesse fora: Ana −${POINTS}, Carla +${POINTS}, Bruno 0.`,
      ],
    },
    {
      question: `Para que serve o ${DESAPARECER}?`,
      answer: [
        `Para sair de casa sem ir a casa de ninguém (quota: ${QUOTAS.VANISH} por partida). Se o Bruno te fizer uma ${VISITA} nessa noite, é um assalto: perdes ${BURGLARY_POINTS} em vez de ${POINTS}.`,
        `Mas um ${DESPEDIMENTO} acerta na mesma (−${POINTS}), e não tens bónus de casa.`,
      ],
    },
    {
      question: 'Posso ir à mesma casa duas noites seguidas?',
      answer: [
        `Não. Se na noite 3 fizeste uma ${VISITA} ao Bruno, na noite 4 não podes ir a casa dele (nem com ${VISITA} nem com ${DESPEDIMENTO}).`,
        'Na noite 5 já podes, se na noite 4 não foste lá.',
      ],
    },
    {
      question: 'Não escolhi nada. E agora?',
      answer: [`Ficas de ${FOLGA}: em casa, e com +${HOME_BONUS} se ninguém te aparecer à porta.`],
    },
    {
      question: 'Posso mudar a escolha?',
      answer: ['Sim, até às 23:59. Conta a última que confirmaste.', 'Numa sala contra bots, até carregares em ⏭️ Passar o dia.'],
    },
    {
      question: 'Porque tenho pontos negativos?',
      answer: [
        `Toda a gente começa com ${SALARY}, mas os pontos podem descer abaixo de zero: é ficar "sem salário".`,
        `Por exemplo: fizeram-te uma ${VISITA} em casa de ${FOLGA} em seis noites. Perdes ${POINTS} de cada vez: ${SALARY} − 6 × ${POINTS} = ${SALARY - 6 * POINTS}.`,
      ],
    },
    {
      id: 'report',
      question: 'O que quer dizer cada linha do meu relatório da manhã?',
      answer: [
        'Cada linha é um movimento dos teus pontos nessa noite. Entre parênteses, a casa onde foste. Em baixo, os pontos da noite. Só tu vês isto.',
        ...(Object.keys(REPORT_MEANING) as LedgerReason[]).map((r) => `${REASON_TEXT[r]}: ${REPORT_MEANING[r]}`),
        `🌙 Noite tranquila: nenhum movimento (por exemplo, saíste e ninguém te foi a casa). Na noite ${NIGHTS}, todos os números vêm a dobrar.`,
      ],
    },
    {
      id: 'building',
      question: 'No Bairro, o que querem dizer a janela acesa, a escura e a sirene?',
      answer: [
        `💡 Janela acesa: essa pessoa ficou em casa nessa noite (${FOLGA} ou ${SEGURANCA}, não se sabe qual).`,
        `✖️ Janela escura, com X: saiu (${VISITA}, ${DESPEDIMENTO} ou ${DESAPARECER}, não se sabe qual nem para onde).`,
        `🚨 Sirene: foi apanhada pela ${SEGURANCA} de alguém. Não se diz em que casa, para não se saber quem se defendeu.`,
      ],
    },
    {
      id: 'start',
      question: 'Porque é que o Começar está desligado?',
      answer: [
        `Uma partida precisa de pelo menos ${MIN_PLAYERS} jogadores. Enquanto faltarem, o lobby diz quantos e o Começar fica desligado: partilha o código.`,
        'Só o admin da sala vê o Começar. Os outros esperam que ele carregue.',
      ],
    },
    {
      question: 'O admin começou a partida tarde. Quando termina a noite 1?',
      answer: [
        'Às 23:59 desse mesmo dia, comece às 9:00 ou às 23:00. Às 00:00 resolve-se, e a noite 2 é o dia seguinte.',
        'Por isso, se o admin carregar em Começar perto da meia-noite, a noite 1 é curta.',
      ],
    },
    {
      question: 'Posso sair da sala depois de Começar?',
      answer: [
        'Não. A partir de Começar a lista de jogadores fica fixa até ao fim da partida: ninguém entra nem sai.',
        `Se deixares de escolher, ficas de ${FOLGA} todas as noites. Numa sala contra bots, podes apagá-la quando quiseres.`,
      ],
    },
    {
      question: 'O que acontece se o admin sair da sala?',
      answer: [
        'Só se pode sair no lobby. Se o admin sair, passa a admin quem entrou há mais tempo. Se não ficar ninguém, a sala desaparece.',
        'Depois de Começar, o admin fica até ao fim, como toda a gente.',
      ],
    },
    {
      question: 'Quem vê as minhas ações?',
      answer: [
        'Ninguém, nem o admin da sala. Os outros só sabem se estavas em casa ou fora, e se foste apanhado.',
        'Os teus pontos também são só teus até ao fim da partida, quando sai o ranking.',
      ],
    },
    {
      id: 'tiebreak',
      question: 'Como se desempata?',
      answer: [
        'Se dois jogadores acabam com os mesmos pontos, desempata-se por esta ordem:',
        `1. Mais ataques bem-sucedidos: ${VISITAS} e ${DESPEDIMENTOS} que renderam pontos.`,
        '2. Confronto direto: mais ataques bem-sucedidos entre os empatados.',
        '3. Menos pontos perdidos.',
        '4. Sorteio. Há sempre um só Funcionário do Mês.',
      ],
    },
    {
      question: 'Como funciona uma sala contra bots?',
      answer: [
        `Escolhes quantos bots queres (de ${BOTS_MIN} a ${BOTS_MAX}) e a partida começa logo. Ninguém mais entra.`,
        'Escolhes a tua ação e carregas em ⏭️ Passar o dia: os bots escolhem ao calhas, sempre dentro das regras, e a noite resolve-se logo.',
        `Se não escolheres nada, ficas de ${FOLGA}. Depois da noite ${NIGHTS}, sai o ranking e podes jogar outra vez.`,
        'Podes apagar a sala quando quiseres, a meio ou no fim, com 🗑️ Apagar sala no Hoje. Apaga-se tudo e não se desfaz.',
      ],
    },
  ];
}

/** Todo o texto da ajuda, pela ordem em que se lê (para os testes: termos definidos à primeira, nomes certos). */
export function helpTextInOrder(): string[] {
  return [
    ...helpSections().flatMap((s) => [
      s.title,
      ...s.intro,
      ...(s.actions ?? []).flatMap((a) => [a.name, a.quota, a.text]),
      ...(s.table ?? []).flatMap((r) => [r.action, r.target, r.result]),
      ...s.outro,
    ]),
    ...helpFaq().flatMap((q) => [q.question, ...q.answer]),
  ];
}
