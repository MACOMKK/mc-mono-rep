// Padronizacao de dados do modulo Oficina (checklist): tudo em MAIUSCULO, exceto e-mail (minusculo);
// telefone e CPF/CNPJ so com digitos. O backend (supabase/functions/_shared/formatacao.ts) aplica
// as mesmas regras -- a validacao do front e so conveniencia, nao substitui a do servidor.
import {
  formatDocumento,
  formatTelefone,
  normalizeDigits as onlyDigits,
  normalizeEmail,
  isValidEmail,
  isValidTelefone,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
} from '@macom/validation';

export {
  formatDocumento,
  formatTelefone,
  onlyDigits,
  normalizeEmail,
  isValidEmail,
  isValidTelefone,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
};

export const toUpperText = (value) => String(value ?? '').toUpperCase();
