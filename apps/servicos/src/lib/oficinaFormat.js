// Padronizacao de dados do modulo Oficina (checklist): tudo em MAIUSCULO, exceto e-mail (minusculo);
// telefone e CPF/CNPJ so com digitos. O backend (supabase/functions/_shared/formatacao.ts) aplica
// as mesmas regras -- a validacao do front e so conveniencia, nao substitui a do servidor.
import { formatDocumento, formatTelefone, onlyDigits } from '@/lib/financeiroFormat';

export { formatDocumento, formatTelefone, onlyDigits };

export const toUpperText = (value) => String(value ?? '').toUpperCase();

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

// Telefone BR: DDD + 8 ou 9 digitos.
export const isValidTelefone = (value) => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

const allEqual = (digits) => /^(\d)\1+$/.test(digits);

export function isValidCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || allEqual(digits)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * (size + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[size])) return false;
  }
  return true;
}

export function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || allEqual(digits)) return false;
  for (const size of [12, 13]) {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    const check = rest < 2 ? 0 : 11 - rest;
    if (check !== Number(digits[size])) return false;
  }
  return true;
}

export function isValidCpfCnpj(value) {
  const digits = onlyDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
}
