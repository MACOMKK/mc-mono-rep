import { normalizeDigits } from './digits';

export function formatTelefone(value) {
  const digits = normalizeDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function formatDocumento(value) {
  const digits = normalizeDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function formatCep(value) {
  const digits = normalizeDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

export const isValidTelefone = (value) => {
  const digits = normalizeDigits(value);
  return digits.length === 10 || digits.length === 11;
};

const allEqual = (digits) => /^(\d)\1+$/.test(digits);

export function isValidCpf(value) {
  const digits = normalizeDigits(value);
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
  const digits = normalizeDigits(value);
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
  const digits = normalizeDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
}
