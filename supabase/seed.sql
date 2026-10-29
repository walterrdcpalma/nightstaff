-- Dados do Supabase local (só `supabase db reset`; nunca corre em dev nem em produção).
-- O Walter e 3 jogadores de teste, numa sala em lobby (código NSTAFF) de que o Walter é admin. Entra-se por magic link; os emails chegam ao Mailpit (http://127.0.0.1:54324).

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'walter@nightstaff.local'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ana@nightstaff.local'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'bruno@nightstaff.local'),
  ('00000000-0000-0000-0000-0000000000c3'::uuid, 'carla@nightstaff.local')
) as u (id, email);

-- Identidade de email, para o GoTrue reconhecer o login por magic link.
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now()
from auth.users;

insert into public.players (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Walter'),
  ('00000000-0000-0000-0000-0000000000a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000000b2', 'Bruno'),
  ('00000000-0000-0000-0000-0000000000c3', 'Carla');

-- Sala em lobby com os 4: o Walter pode carregar em Começar.
insert into public.rooms (code, admin_id) values ('NSTAFF', '00000000-0000-0000-0000-000000000001');
insert into public.room_players (room_id, player_id, joined_at)
select r.id, p.id, now() + p.ord * interval '1 second'
from public.rooms r,
  (values
    ('00000000-0000-0000-0000-000000000001'::uuid, 0),
    ('00000000-0000-0000-0000-0000000000a1'::uuid, 1),
    ('00000000-0000-0000-0000-0000000000b2'::uuid, 2),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 3)
  ) as p (id, ord)
where r.code = 'NSTAFF';
