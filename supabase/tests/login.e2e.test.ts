// T24 — Entrar com o código de 6 dígitos do email, como na app guardada no ecrã principal do telemóvel. Usa o
// cliente do web (`web/src/lib/supabase.ts`, só com a chave pública): pede o código, lê-o no Mailpit, entra com
// `verifyOtp` e lê as próprias salas. Corre com `npm run test:db` (precisa de `npx supabase start`).
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = !!process.env.SUPABASE_E2E;

let url = '';
let serviceKey = '';
let mailpit = '';
type Client = typeof import('../../web/src/lib/supabase.ts')['supabase'];
let supabase: Client;
type Login = typeof import('../../web/src/lib/login.ts');
let login: Login;

const email = `codigo-${Date.now()}@e2e.local`;
let userId = '';
let roomId = 0;

/** O código do email mais recente para `to`, lido no Mailpit (espera que chegue). */
async function codeFor(to: string, after: number): Promise<{ code: string; subject: string; html: string }> {
  for (let i = 0; i < 50; i++) {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const latest = search.messages?.find((m: { Created: string }) => Date.parse(m.Created) >= after);
    if (latest) {
      const msg = await fetch(`${mailpit}/api/v1/message/${latest.ID}`).then((r) => r.json());
      const code = /\b\d{6}\b/.exec(msg.HTML)?.[0];
      if (!code) throw new Error(`Email sem código: ${msg.HTML}`);
      return { code, subject: msg.Subject, html: msg.HTML };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Não chegou nenhum email para ${to}`);
}

describe.skipIf(!enabled)('entrar com o código do email (T24)', () => {
  beforeAll(async () => {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    url = status.API_URL;
    serviceKey = status.SERVICE_ROLE_KEY;
    mailpit = status.MAILPIT_URL ?? status.INBUCKET_URL;
    if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Só no Supabase local: ${url}`);
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', status.ANON_KEY);
    ({ supabase } = await import('../../web/src/lib/supabase.ts'));
    login = await import('../../web/src/lib/login.ts');
  });

  afterAll(async () => {
    if (!url) return;
    await supabase?.auth.signOut();
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    if (roomId) await fetch(`${url}/rest/v1/rooms?id=eq.${roomId}`, { method: 'DELETE', headers: admin });
    if (userId) await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    vi.unstubAllEnvs();
  });

  it('uma conta nova entra com o código e lê as suas salas', async () => {
    const sentAt = Date.now() - 1000;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    expect(error).toBeNull();
    const mail = await codeFor(email, sentAt);
    expect(mail.subject).toBe('Night Staff: o teu código de entrada');
    // O link continua lá, por baixo do código.
    expect(mail.html).toContain('Entrar no Night Staff');
    expect(login.otpError(mail.code)).toBeNull();

    // Um código errado não entra, e o erro tem texto em português.
    const wrong = String((Number(mail.code) + 1) % 1_000_000).padStart(6, '0');
    const bad = await supabase.auth.verifyOtp({ email, token: wrong, type: 'email' });
    expect(bad.error).not.toBeNull();
    expect(login.loginErrorText(bad.error!)).toBe('Esse código está errado ou já expirou. Pede outro código.');

    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: mail.code, type: 'email' });
    expect(verifyError).toBeNull();
    userId = data.user!.id;

    // Já com sessão: o nome (primeiro login), uma sala, e lê-a como em As minhas salas.
    expect((await supabase.from('players').insert({ id: userId, name: 'Código' })).error).toBeNull();
    roomId = (await supabase.rpc('create_room')).data.id;
    const rooms = await supabase.from('rooms').select('id');
    expect(rooms.error).toBeNull();
    expect(rooms.data).toEqual([{ id: roomId }]);
  });

  it('uma conta que já existe também entra com o código (e o código só vale uma vez)', async () => {
    await supabase.auth.signOut();
    await new Promise((r) => setTimeout(r, 1100)); // max_frequency = 1s entre emails
    const sentAt = Date.now() - 1000;
    expect((await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })).error).toBeNull();
    const { code } = await codeFor(email, sentAt);
    expect((await supabase.auth.verifyOtp({ email, token: code, type: 'email' })).error).toBeNull();
    expect((await supabase.from('rooms').select('id')).data).toEqual([{ id: roomId }]);

    await supabase.auth.signOut();
    const again = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    expect(again.error).not.toBeNull();
  });
});
