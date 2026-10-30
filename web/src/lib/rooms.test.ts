import { describe, expect, it } from 'vitest';
import { botsNight, canDeleteRoom, canStart, DELETE_ROOM_WARNING, codeError, missingPlayersText, nameButtonText, nameError, needsMe, normalizeCode, openNight, roomErrorText, roomTodo, sortRooms } from './rooms.ts';
import type { RoomCard } from './rooms.ts';
import { MIN_PLAYERS } from '../../../engine/index.ts';

const card = (over: Partial<RoomCard>): RoomCard => ({
  id: 1,
  code: 'ABCDEF',
  kind: 'people',
  status: 'lobby',
  isAdmin: false,
  players: 1,
  night: null,
  chosen: false,
  ...over,
});

describe('As minhas salas: o que falta fazer', () => {
  it('lobby: o admin sabe se já pode começar; os outros esperam', () => {
    expect(roomTodo(card({ isAdmin: true, players: 2 }))).toBe('À espera de jogadores (2/3).');
    expect(roomTodo(card({ isAdmin: true, players: 3 }))).toBe('Já podes carregar em Começar.');
    expect(roomTodo(card({ players: 5 }))).toBe('À espera que o admin carregue em Começar.');
  });

  it('a decorrer: escolhe até às 23:59, ou já escolheste', () => {
    expect(roomTodo(card({ status: 'running', night: 4 }))).toBe('Noite 4: escolhe até às 23:59.');
    expect(roomTodo(card({ status: 'running', night: 4, chosen: true }))).toBe('Noite 4: já escolheste.');
    expect(roomTodo(card({ status: 'running', night: null }))).toBe('O bairro está a acordar…');
  });

  it('acabada: o admin pode reiniciar', () => {
    expect(roomTodo(card({ status: 'finished' }))).toBe('Acabou. Vê o Funcionário do Mês.');
    expect(roomTodo(card({ status: 'finished', isAdmin: true }))).toBe('Acabou. Vê o Funcionário do Mês ou reinicia a sala.');
  });

  it('primeiro as salas à minha espera, depois as mais recentes', () => {
    const waiting = card({ id: 1, status: 'running', night: 2 });
    const done = card({ id: 2, status: 'running', night: 2, chosen: true });
    const startable = card({ id: 3, isAdmin: true, players: 4 });
    const finished = card({ id: 4, status: 'finished' });
    expect(needsMe(waiting)).toBe(true);
    expect(needsMe(done)).toBe(false);
    expect(needsMe(startable)).toBe(true);
    expect(sortRooms([waiting, done, startable, finished]).map((r) => r.id)).toEqual([3, 1, 4, 2]);
  });

  it('noite aberta: do dia do Começar à noite 9; depois, a acordar', () => {
    expect(openNight('2026-11-02', '2026-11-02')).toBe(1);
    expect(openNight('2026-11-02', '2026-11-10')).toBe(9);
    expect(openNight('2026-11-02', '2026-11-11')).toBeNull();
  });
});

describe('salas contra bots', () => {
  it('a noite aberta é a seguinte à última resolvida, a qualquer hora; depois da 9, nenhuma', () => {
    expect(botsNight(0)).toBe(1);
    expect(botsNight(8)).toBe(9);
    expect(botsNight(9)).toBeNull();
  });

  it('a sala está sempre à minha espera: o tempo só passa quando eu carrego em Passar o dia', () => {
    const bots = card({ kind: 'bots', status: 'running', night: 3, chosen: true, isAdmin: true });
    expect(roomTodo(bots)).toBe('Noite 3: escolhe e carrega em ⏭️ Passar o dia.');
    expect(needsMe(bots)).toBe(true);
    expect(roomErrorText('BOT_COUNT')).toBe('Escolhe entre 2 e 11 bots.');
  });

  it('🗑️ Apagar sala só numa sala contra bots, pelo admin (T17)', () => {
    expect(canDeleteRoom({ kind: 'bots', admin_id: 'eu' }, 'eu')).toBe(true);
    expect(canDeleteRoom({ kind: 'people', admin_id: 'eu' }, 'eu')).toBe(false);
    expect(canDeleteRoom({ kind: 'bots', admin_id: 'outro' }, 'eu')).toBe(false);
    expect(DELETE_ROOM_WARNING).toContain('não se desfaz');
    expect(roomErrorText('NOT_BOTS_ROOM')).toBe('Só se apagam as salas contra bots.');
  });
});

describe('lobby', () => {
  it('Começar só com 3 ou mais jogadores', () => {
    expect(canStart(2)).toBe(false);
    expect(canStart(3)).toBe(true);
  });
});

describe('código da sala', () => {
  it('aceita minúsculas e espaços', () => {
    expect(normalizeCode(' ab cd ef ')).toBe('ABCDEF');
    expect(codeError('ab cd ef')).toBeNull();
  });

  it('6 caracteres sem letras ambíguas', () => {
    expect(codeError('ABCDE')).not.toBeNull();
    expect(codeError('ABCDEFG')).not.toBeNull();
    for (const bad of ['ABCDE0', 'ABCDEO', 'ABCDE1', 'ABCDEI', 'ABCDEL']) expect(codeError(bad)).not.toBeNull();
  });
});

describe('nome no primeiro login', () => {
  it('de 1 a 24 caracteres, sem contar os espaços nas pontas', () => {
    expect(nameError('   ')).toBe('Escreve um nome.');
    expect(nameError('  Ana  ')).toBeNull();
    expect(nameError('x'.repeat(24))).toBeNull();
    expect(nameError('x'.repeat(25))).toBe('No máximo 24 caracteres.');
  });
});

describe('mudar o meu nome (T15)', () => {
  it('o botão do cabeçalho mostra o meu nome', () => {
    expect(nameButtonText('Walter')).toBe('🪪 Walter');
  });

  it('a validação é a do primeiro login: 1 a 24 caracteres, sem contar os espaços nas pontas', () => {
    expect(nameError('  Walter  ')).toBeNull();
    expect(nameError('')).toBe('Escreve um nome.');
    expect(nameError('W'.repeat(25))).toBe('No máximo 24 caracteres.');
  });
});

describe('erros das funções da sala', () => {
  it('em português, com um texto por omissão', () => {
    expect(roomErrorText('ROOM_NOT_FOUND')).toBe('Não há nenhuma sala com esse código.');
    expect(roomErrorText('TOO_FEW_PLAYERS')).toBe('São precisos pelo menos 3 jogadores.');
    expect(roomErrorText('xpto')).toBe('Algo correu mal. Tenta outra vez.');
  });
});

describe('lobby: quantos jogadores faltam (T21)', () => {
  it('diz quantos faltam até 3 e nada a partir daí', () => {
    expect(missingPlayersText(1)).toBe('Faltam 2 jogadores para Começar.');
    expect(missingPlayersText(2)).toBe('Falta 1 jogador para Começar.');
    expect(missingPlayersText(MIN_PLAYERS)).toBeNull();
    expect(missingPlayersText(MIN_PLAYERS + 4)).toBeNull();
  });
});
