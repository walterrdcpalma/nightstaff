// T8 — Revisão final de segurança: nenhuma chave service_role (nem outro segredo) no web/ nem no bundle.
// Faz o build do web para uma pasta temporária e procura, no bundle e nas fontes:
// - JWTs do Supabase com `role` diferente de `anon` (a service_role é um JWT com `role: service_role`);
// - chaves secretas novas do Supabase (`sb_secret_` seguido do segredo; o prefixo sozinho aparece no supabase-js,
//   que o usa para reconhecer o tipo de chave);
// - nomes de variáveis da service_role (`SERVICE_ROLE`, `service_role_key`).
// Corre no `npm test`. Fica fora do `web/src` para não entrar no bundle nem no `tsc -p web`.
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WEB = import.meta.dirname;
let out = '';

/** Todos os ficheiros de uma pasta, recursivamente. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Papéis (`role`) dos JWTs que aparecem no texto. */
function jwtRoles(text: string): string[] {
  return [...text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)].map((m) => {
    try {
      return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role ?? '?';
    } catch {
      return '?';
    }
  });
}

const SECRET_NAMES = /SERVICE_ROLE|service_role_key|sb_secret_[\w-]{16,}/g;

/** Problemas num texto: JWTs que não são a chave pública, chaves secretas ou nomes da service_role. */
function leaks(text: string): string[] {
  return [...jwtRoles(text).filter((r) => r !== 'anon').map((r) => `JWT com role ${r}`), ...(text.match(SECRET_NAMES) ?? [])];
}

describe('nenhuma chave service_role no web/ nem no bundle (T8)', () => {
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'nightstaff-bundle-'));
    execSync(`npx vite build "${WEB}" --outDir "${out}" --emptyOutDir --logLevel error`, { stdio: 'pipe' });
  }, 60_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it('o detetor apanha uma service_role e deixa passar a chave pública', () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.c2lnbmF0dXJl`;
    expect(leaks(`const k = "${jwt('anon')}"`)).toEqual([]);
    expect(leaks(`const k = "${jwt('service_role')}"`)).toEqual(['JWT com role service_role']);
    expect(leaks('VITE_SUPABASE_SERVICE_ROLE_KEY')).toEqual(['SERVICE_ROLE']);
    expect(leaks('const k = "sb_secret_INVENTADA0123456789abcd"')).toEqual(['sb_secret_INVENTADA0123456789abcd']);
    // O supabase-js tem o prefixo para reconhecer o tipo de chave: não é uma chave.
    expect(leaks('e.startsWith(`sb_publishable_`)||e.startsWith(`sb_secret_`)')).toEqual([]);
  });

  it('o bundle (JS, CSS e HTML) não tem nenhuma', () => {
    const bundle = files(out);
    expect(bundle.some((f) => f.endsWith('.js'))).toBe(true);
    for (const f of bundle) expect(leaks(readFileSync(f, 'utf8')), f).toEqual([]);
  });

  it('as fontes do web/ e os ficheiros de ambiente também não', () => {
    const sources = files(join(WEB, 'src')).filter((f) => /\.(ts|tsx|css|json)$/.test(f));
    const env = ['.env', '.env.local', '.env.example', '.env.production'].map((f) => join(WEB, f)).filter(existsSync);
    for (const f of [...sources, join(WEB, 'index.html'), ...env]) expect(leaks(readFileSync(f, 'utf8')), f).toEqual([]);
  });
});
