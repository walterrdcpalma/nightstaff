import { describe, expect, it } from 'vitest';
import { loginErrorText, normalizeOtp, OTP_LENGTH, otpError } from './login.ts';

describe('login com código (T24)', () => {
  it('o código tem 6 dígitos, como o otp_length do Supabase', () => {
    expect(OTP_LENGTH).toBe(6);
    expect(otpError('123456')).toBeNull();
    expect(otpError('12345')).toBe('O código tem 6 dígitos.');
    expect(otpError('1234567')).toBe('O código tem 6 dígitos.');
    expect(otpError('')).toBe('O código tem 6 dígitos.');
  });

  it('aceita o código colado com espaços ou traços', () => {
    expect(normalizeOtp(' 123 456 ')).toBe('123456');
    expect(normalizeOtp('123-456')).toBe('123456');
    expect(otpError('123 456')).toBeNull();
  });

  it('erros do Auth em português', () => {
    expect(loginErrorText({ code: 'otp_expired', status: 403 })).toBe('Esse código está errado ou já expirou. Pede outro código.');
    expect(loginErrorText({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'Demasiados pedidos. Espera um minuto e tenta outra vez.',
    );
    expect(loginErrorText({ status: 429 })).toBe('Demasiados pedidos. Espera um minuto e tenta outra vez.');
    expect(loginErrorText({ code: 'unexpected_failure', status: 500 })).toBe('Não conseguimos abrir a porta. Tenta outra vez.');
    expect(loginErrorText({})).toBe('Não conseguimos abrir a porta. Tenta outra vez.');
  });
});
