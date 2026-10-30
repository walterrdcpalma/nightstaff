import { describe, expect, it } from 'vitest';
import { adminDates, adminNight, groupAdminRooms } from './admin.ts';
import type { AdminRoomRow } from './admin.ts';

const row = (over: Partial<AdminRoomRow>): AdminRoomRow => ({
  room_id: 1,
  code: 'ABCDEF',
  kind: 'people',
  status: 'lobby',
  admin_name: 'Ana',
  players: ['Ana'],
  created_at: '2026-10-20T10:00:00Z',
  start_date: null,
  resolved_nights: 0,
  last_resolved_at: null,
  ...over,
});

describe('painel da app (T23)', () => {
  it('separa correntes (lobby ou a decorrer) e fechadas (acabadas), as mais recentes primeiro', () => {
    const { current, closed } = groupAdminRooms(
      [
        row({ room_id: 1, status: 'finished', created_at: '2026-10-01T10:00:00Z' }),
        row({ room_id: 2, status: 'lobby', created_at: '2026-10-02T10:00:00Z' }),
        row({ room_id: 3, status: 'running', start_date: '2026-10-28', created_at: '2026-10-03T10:00:00Z' }),
        row({ room_id: 4, status: 'finished', created_at: '2026-10-04T10:00:00Z' }),
        row({ room_id: 5, status: 'lobby', created_at: '2026-10-03T10:00:00Z' }),
      ],
      '2026-10-30',
    );
    expect(current.map((r) => r.room_id)).toEqual([5, 3, 2]);
    expect(closed.map((r) => r.room_id)).toEqual([4, 1]);
  });

  it('noite em curso: pelo relógio nas de pessoas, pela última resolvida nas de bots', () => {
    expect(adminNight(row({ status: 'running', start_date: '2026-10-28' }), '2026-10-30')).toBe(3);
    expect(adminNight(row({ status: 'running', kind: 'bots', start_date: '2026-10-01', resolved_nights: 4 }), '2026-10-30')).toBe(5);
    expect(adminNight(row({ status: 'running', start_date: '2026-10-01' }), '2026-10-30')).toBeNull();
    expect(adminNight(row({ status: 'lobby' }), '2026-10-30')).toBeNull();
    expect(adminNight(row({ status: 'finished', start_date: '2026-10-01', resolved_nights: 9 }), '2026-10-30')).toBeNull();
  });

  it('datas em Lisboa: criada, noite 1 e, acabada, o fim', () => {
    expect(adminDates(row({ created_at: '2026-10-20T23:30:00Z' }))).toEqual(['Criada a 2026-10-21']);
    expect(
      adminDates(
        row({ status: 'finished', start_date: '2026-10-21', last_resolved_at: '2026-10-30T00:00:05Z', created_at: '2026-10-20T10:00:00Z' }),
      ),
    ).toEqual(['Criada a 2026-10-20', 'Noite 1 a 2026-10-21', 'Acabou a 2026-10-30']);
  });

  it('só metadados: as linhas não têm ações, pontos, ledger nem rankings', () => {
    const keys = Object.keys(groupAdminRooms([row({})], '2026-10-30').current[0]);
    for (const k of keys) expect(k).not.toMatch(/action|point|ledger|rank|delta|target/);
  });
});
