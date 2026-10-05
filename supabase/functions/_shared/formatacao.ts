// Padronizacao de dados (usada hoje por servicos-oficina-api): textos em MAIUSCULO, e-mail em
// minusculo, telefone e CPF/CNPJ so com digitos. Espelha apps/servicos/src/lib/oficinaFormat.js
// (Edge Functions rodam em Deno e nao resolvem imports de apps/ nem packages/).

export const onlyDigits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

// Maiusculo + trim; vazio/nulo vira null (pronto pra gravar em coluna nullable).
export const upperOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
};

export const normalizeEmail = (value: unknown): string | null => {
  const text = String(value ?? '').trim().toLowerCase();
  return text || null;
};

export const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export const isValidTelefone = (digits: string): boolean => digits.length === 10 || digits.length === 11;

const allEqual = (digits: string): boolean => /^(\d)\1+$/.test(digits);

export function isValidCpf(value: unknown): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || allEqual(digits)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * (size + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(digits[size])) return false;
  }
  return true;
}

export function isValidCnpj(value: unknown): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || allEqual(digits)) return false;
  for (const size of [12, 13]) {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    if ((rest < 2 ? 0 : 11 - rest) !== Number(digits[size])) return false;
  }
  return true;
}

export const isValidCpfCnpj = (digits: string): boolean =>
  digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
