// Ajuda (T13): como funciona o jogo, para quem nunca ouviu falar dele. Dados puros, testados em help.test.ts.
// Os números vêm das constantes do engine/ e os nomes das ações do ACTION_NAMES (RULES.md §2): se mudarem, a ajuda
// muda sozinha. É estática: não lê nada da BD, por isso não revela nada privado.
import { BURGLARY_POINTS, DEFENDED_COST, HOME_BONUS, MIN_PLAYERS, NIGHTS, POINTS, QUOTAS, SALARY } from '../../../engine/index.ts';
import type { ActionType } from '../../../engine/index.ts';
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

export interface HelpSection {
  title: string;
  paragraphs: string[];
}

export interface HelpAction {
  name: string;
  /** "∞" ou "2 por partida". */
  quota: string;
  home: boolean;
  text: string;
}

export interface HelpQuestion {
  question: string;
  answer: string[];
}

const HOME_ACTIONS: ActionType[] = ['STAY', 'DEFEND'];

const ACTION_TEXT: Record<ActionType, string> = {
  STAY: `Ficas em casa a descansar. Se ninguém te atacar, ganhas o bónus de casa (+${HOME_BONUS}).`,
  DEFEND: `Ficas em casa de lanterna na mão. Quem te atacar perde pontos e fica apanhado à vista de todos, e tu ganhas ${POINTS} por cada um.`,
  ATTACK: `Vais a casa de alguém tirar-lhe ${POINTS} pontos. Se a casa estiver vazia, é um assalto: rende menos.`,
  BOMB: `Vais a casa de alguém e levas tudo: acerta mesmo que o alvo esteja fora, e estraga as Visitas dos outros nessa casa.`,
  VANISH: `Sais de casa sem atacar ninguém, para não estares lá se te baterem à porta. Não tens bónus de casa.`,
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

/** Parte 1: como funciona, em 1 minuto. As ações vêm à parte, em `helpActions`, a seguir à segunda secção. */
export function helpSections(): HelpSection[] {
  return [
    {
      title: '🌙 A ideia',
      paragraphs: [
        `És do staff do bairro. Uma partida tem ${NIGHTS} noites e, todas as noites, escolhes o que fazes.`,
        `Começas com um salário de ${SALARY} pontos. No fim, quem tiver mais pontos é o 🏆 Funcionário do Mês.`,
      ],
    },
    {
      title: '🪟 Em casa ou fora',
      paragraphs: [
        'Cada ação deixa-te em casa ou fora. De manhã, o bairro inteiro sabe quem tinha a janela acesa e quem saiu. Nunca sabe o que cada um fez.',
        `Quem está fora não está lá para defender a casa: se alguém a visitar, é um assalto à casa vazia. Só o ${DESPEDIMENTO} acerta em quem está fora como se estivesse em casa.`,
      ],
    },
    {
      title: '💰 Como se ganham e perdem pontos',
      paragraphs: [
        `${VISITA} a quem está em casa de ${FOLGA}: ganhas ${POINTS} e a pessoa perde ${POINTS}.`,
        `Várias ${VISITA}s à mesma casa, com o dono em casa de ${FOLGA} e sem ${DESPEDIMENTO}: há sorteio. Quem ganha leva ${POINTS}; cada um dos outros perde ${POINTS}.`,
        `Casa vazia: o dono perde ${BURGLARY_POINTS} e os atacantes dividem ${BURGLARY_POINTS} (arredondado para baixo).`,
        `Atacar quem tem ${SEGURANCA}: uma ${VISITA} custa-te ${DEFENDED_COST.ATTACK}, um ${DESPEDIMENTO} custa-te ${DEFENDED_COST.BOMB}. Quem se defendeu ganha ${POINTS} por cada atacante.`,
        `${DESPEDIMENTO} sem ${SEGURANCA} do outro lado: o alvo perde ${POINTS}, esteja em casa ou fora, e quem o fez fica com o bolo. Não há sorteio: com o alvo fora, as ${VISITA}s na mesma casa ficam com 0; com o alvo em casa, perdem ${POINTS} cada e esses pontos vão para o bolo.`,
        `Bónus de casa: quem fica em casa (${FOLGA} ou ${SEGURANCA}) e não é atacado ganha +${HOME_BONUS}.`,
        `A noite ${NIGHTS} conta a dobrar: todos os pontos dessa noite, bónus incluído.`,
        'Os pontos podem descer abaixo de zero.',
      ],
    },
    {
      title: '⏰ Prazo',
      paragraphs: [
        'Escolhes até às 23:59 e, até lá, podes mudar de ideias. Às 00:00 resolve-se tudo ao mesmo tempo.',
        `Quem não escolher fica de ${FOLGA}.`,
        `Não podes ir à mesma casa duas noites seguidas (${VISITA} ou ${DESPEDIMENTO}). Uma noite sem ir lá volta a permitir.`,
        'A quota gasta-se sempre que escolhes a ação, corra bem ou mal.',
      ],
    },
    {
      title: '👀 O que os outros vêem e o que só tu vês',
      paragraphs: [
        'Ninguém vê as ações dos outros: nem antes da meia-noite, nem depois.',
        `De manhã, todos sabem quem estava em casa e quem estava fora, e quem foi apanhado pela ${SEGURANCA} (sem dizer em que casa).`,
        `O resto só tu vês: se te atacaram, assaltaram ou te apanhou um ${DESPEDIMENTO} (sem saber quem), se ganhaste ou perdeste um sorteio, quem apanhaste com a ${SEGURANCA}, se ganhaste o bónus de casa e os teus pontos. O ranking completo só aparece no fim da partida.`,
      ],
    },
    {
      title: '🚪 Salas',
      paragraphs: [
        'Cria uma sala e partilha o código de 6 caracteres. Quem a cria é o admin.',
        `O admin carrega em Começar quando houver pelo menos ${MIN_PLAYERS} jogadores, e a noite 1 abre logo. Depois disso, ninguém entra nem sai.`,
        'No fim, o admin pode Reiniciar a sala: volta ao lobby com o mesmo código.',
        `Numa sala contra bots jogas contra ${BOTS_MIN} a ${BOTS_MAX} bots, e o dia só passa quando carregas em ⏭️ Passar o dia.`,
      ],
    },
  ];
}

const half = Math.floor(BURGLARY_POINTS / 2);

/** Parte 2: perguntas frequentes, cada uma com um mini-cenário e os pontos certos (RULES.md §3). */
export function helpFaq(): HelpQuestion[] {
  return [
    {
      question: 'O Bruno e a Carla atacam a Ana ao mesmo tempo. O que acontece?',
      answer: [
        `Se a Ana estiver em casa de ${FOLGA}, há sorteio. Se o Bruno ganhar: Bruno +${POINTS}, Ana −${POINTS}, Carla −${POINTS}.`,
        `Se a Ana tiver ${SEGURANCA}: Bruno −${DEFENDED_COST.ATTACK}, Carla −${DEFENDED_COST.ATTACK}, Ana +${POINTS * 2}, e os dois ficam apanhados.`,
        `Se a Ana estiver fora, é um assalto: Ana −${BURGLARY_POINTS}, e o Bruno e a Carla dividem ${BURGLARY_POINTS}: +${half} cada (arredondado para baixo).`,
      ],
    },
    {
      question: 'Ataquei alguém que estava fora. E agora?',
      answer: [
        `É um assalto à casa vazia. Se foste só tu: tu +${BURGLARY_POINTS}, o dono −${BURGLARY_POINTS}. Com mais atacantes, dividem os ${BURGLARY_POINTS}.`,
        `Se alguém fez um ${DESPEDIMENTO} na mesma casa, o ${DESPEDIMENTO} leva tudo e tu ficas com 0.`,
      ],
    },
    {
      question: `O que acontece se atacarem alguém com ${SEGURANCA}?`,
      answer: [
        `O Bruno faz uma ${VISITA} à Ana, que tinha ${SEGURANCA}: Bruno −${DEFENDED_COST.ATTACK}, Ana +${POINTS}.`,
        `Com um ${DESPEDIMENTO} em vez da ${VISITA}: Bruno −${DEFENDED_COST.BOMB}, Ana +${POINTS}.`,
        'De manhã, o bairro fica a saber que o Bruno foi apanhado, mas não em que casa.',
      ],
    },
    {
      question: `Para que serve o ${DESPEDIMENTO} e porque só o posso usar uma vez?`,
      answer: [
        `É a ação mais forte: acerta mesmo em quem está fora e ganha às ${VISITA}s na mesma casa. Por isso a quota é ${QUOTAS.BOMB} por partida.`,
        `A Ana está em casa de ${FOLGA}; o Bruno faz uma ${VISITA} e a Carla um ${DESPEDIMENTO}. Não há sorteio: Ana −${POINTS}, Bruno −${POINTS}, Carla +${POINTS * 2}.`,
        `Se a Ana estivesse fora: Ana −${POINTS}, Carla +${POINTS}, Bruno 0.`,
      ],
    },
    {
      question: `Para que serve o ${DESAPARECER}?`,
      answer: [
        `Para sair de casa sem atacar ninguém (quota: ${QUOTAS.VANISH} por partida). Se o Bruno te fizer uma ${VISITA} nessa noite, é um assalto: perdes ${BURGLARY_POINTS} em vez de ${POINTS}.`,
        `Mas um ${DESPEDIMENTO} acerta na mesma (−${POINTS}), e não tens bónus de casa.`,
      ],
    },
    {
      question: 'Posso atacar a mesma pessoa duas noites seguidas?',
      answer: [
        `Não. Se na noite 3 fizeste uma ${VISITA} ao Bruno, na noite 4 não podes ir a casa dele (nem com ${VISITA} nem com ${DESPEDIMENTO}).`,
        'Na noite 5 já podes, se na noite 4 não foste lá.',
      ],
    },
    {
      question: 'Não escolhi nada. E agora?',
      answer: [`Ficas de ${FOLGA}: em casa, e com +${HOME_BONUS} se ninguém te atacar.`],
    },
    {
      question: 'Posso mudar a escolha?',
      answer: ['Sim, até às 23:59. Conta a última que confirmaste.', 'Numa sala contra bots, até carregares em ⏭️ Passar o dia.'],
    },
    {
      question: 'Porque tenho pontos negativos?',
      answer: [
        `Toda a gente começa com ${SALARY}, mas os pontos podem descer abaixo de zero: é ficar "sem salário".`,
        `Por exemplo, ${SALARY} − ${POINTS} × ${SALARY / POINTS + 1} = ${SALARY - POINTS * (SALARY / POINTS + 1)}.`,
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
      question: 'Como se desempata?',
      answer: [
        'Se dois jogadores acabam com os mesmos pontos, desempata-se por esta ordem:',
        `1. Mais ataques bem-sucedidos (${VISITA}s e ${DESPEDIMENTO}s que renderam pontos).`,
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
