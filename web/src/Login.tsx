import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { loginErrorText, normalizeOtp, OTP_LENGTH, otpError } from '@/lib/login';
import { supabase } from '@/lib/supabase';

/**
 * Login por email. O registo é aberto (RULES.md §1 v6): o primeiro email cria a conta. O email traz um link e um
 * código de 6 dígitos (T24): o código entra onde é escrito, por isso serve na app guardada no ecrã principal, que
 * não partilha a sessão com o browser onde o link abre.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
      if (error) return setError(loginErrorText(error));
      if (sent) setNotice('Enviámos outro código. Usa o do email mais recente.');
      setCode('');
      setSent(true);
    } catch {
      setError(loginErrorText({}));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const invalid = otpError(code);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    try {
      // Com sucesso, o `onAuthStateChange` do App troca de ecrã.
      const { error } = await supabase.auth.verifyOtp({ email, token: normalizeOtp(code), type: 'email' });
      if (error) setError(loginErrorText(error));
    } catch {
      setError(loginErrorText({}));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-secondary-background">
      <CardHeader>
        <CardTitle>
          <h2>Entrada do pessoal</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sent ? (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <p>
              Enviámos-te um email para <strong className="break-all">{email}</strong>, com um link e um código de {OTP_LENGTH}{' '}
              dígitos. Escreve o código aqui, ou abre o link neste mesmo browser.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-heading">Código do email</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 \-]*"
                maxLength={OTP_LENGTH + 2}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? 'Um momento…' : 'Entrar'}
            </Button>
            {notice && <p>{notice}</p>}
            {error && <p className="text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="neutral" size="sm" onClick={() => send()} disabled={busy}>
                Pedir outro código
              </Button>
              <Button
                type="button"
                variant="neutral"
                size="sm"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setCode('');
                  setSent(false);
                }}
                disabled={busy}
              >
                Outro email
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4">
            <p>Diz-nos o teu email e mandamos-te a chave do bairro: um código e um link.</p>
            <Input type="email" required placeholder="o-teu@email.pt" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {busy ? 'A enviar…' : 'Enviar código'}
            </Button>
            {error && <p className="text-danger">{error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
