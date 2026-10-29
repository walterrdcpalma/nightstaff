import { describe, expect, it } from 'vitest';
import { visibleResult } from './load.ts';

describe('useLoad: o que se mostra', () => {
  const cicloA = () => Promise.resolve('A');
  const cicloB = () => Promise.resolve('B');

  it('mostra o resultado da leitura atual', () => {
    expect(visibleResult({ load: cicloA, data: 'A' }, cicloA)).toEqual({ data: 'A', error: false });
  });

  it('ao trocar de ciclo, os dados do anterior deixam de se ver até chegar a resposta nova', () => {
    expect(visibleResult({ load: cicloA, data: 'A' }, cicloB)).toEqual({ data: undefined, error: false });
  });

  it('um erro de uma leitura antiga também não se mostra', () => {
    expect(visibleResult({ load: cicloA, error: true }, cicloB).error).toBe(false);
    expect(visibleResult({ load: cicloB, error: true }, cicloB).error).toBe(true);
  });

  it('antes da primeira resposta, nada', () => {
    expect(visibleResult(null, cicloA)).toEqual({ data: undefined, error: false });
  });
});
