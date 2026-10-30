// Login (T24): o email traz o link e um código de 6 dígitos. O código serve para entrar na app guardada no ecrã
// principal do telemóvel, que não partilha a sessão com o browser onde o link abre. Testada em login.test.ts.

/** Dígitos do código, como o `otp_length` do Supabase (`supabase/config.toml`). */
export const OTP_LENGTH = 6;

/** O código como se manda ao Supabase: só os dígitos (quem cola "123 456" também entra). */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, '');
}

/** Erro do código antes de o mandar, ou `null`. */
export function otpError(input: string): string | null {
  return normalizeOtp(input).length === OTP_LENGTH ? null : `O código tem ${OTP_LENGTH} dígitos.`;
}

/** Erros do Auth (pedir o email ou entrar com o código), em português de Portugal. */
export function loginErrorText(error: { code?: string; status?: number }): string {
  if (error.status === 429 || error.code?.startsWith('over_')) {
    return 'Demasiados pedidos. Espera um minuto e tenta outra vez.';
  }
  if (error.code === 'otp_expired' || error.code === 'otp_disabled') {
    return 'Esse código está errado ou já expirou. Pede outro código.';
  }
  return 'Não conseguimos abrir a porta. Tenta outra vez.';
}
