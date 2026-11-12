// Normalizacao de telefone do WhatsApp, compartilhada entre whatsapp-api (mensagens recebidas) e
// crm-api (iniciar conversa pelo Atendimento).
//
// Formatos reais no banco (conferido em 2026-11-12):
//   - conversas_atendimento.telefone_normalizado: com DDI, 13 digitos (ex.: 5591983927903),
//     porque vem do numero do WhatsApp;
//   - gestao_crm.leads / public.clientes.telefone_normalizado: SEM DDI, 10 ou 11 digitos
//     (crm-api grava so os digitos digitados no formulario).
// Por isso o vinculo conversa -> lead/cliente precisa comparar a forma nacional (telefoneNacional),
// nao o valor da conversa direto -- antes disso o webhook nunca achava o lead/cliente.

// O WhatsApp (Meta e Baileys/Evolution) por vezes entrega numeros de celular brasileiros sem o
// 9o digito (formato anterior a' resolucao Anatel 2016), mesmo quando o numero real do cliente
// ja tem o 9 -- resultado: o mesmo contato gera telefone_normalizado diferente dependendo de
// qual mensagem chegou primeiro. Reconstroi o 9o digito quando: DDI 55 + DDD (2) + local (8)
// comecando em 6-9 (faixa de celular; fixo comeca em 2-5 e nao tem 9o digito, nao mexe).
export function normalizeBrazilianMobile(digits: string) {
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    if (/^[6-9]/.test(local)) {
      return `55${ddd}9${local}`;
    }
  }
  return digits;
}

// Numero como o WhatsApp entrega (sempre com DDI) -> formato de conversas_atendimento.
export function normalizePhone(phone: string) {
  return normalizeBrazilianMobile(String(phone || '').replace(/\D/g, ''));
}

// Numero digitado/cadastrado no CRM (lead, cliente, campo "Nova conversa"): sem DDI (10/11
// digitos) e' tratado como brasileiro e ganha o 55. Com DDI (12+ digitos) e' usado como veio.
// Nao usar no webhook: la um numero estrangeiro de 11 digitos (ex.: EUA) ganharia 55 por engano.
export function normalizeTelefoneDigitado(phone: string) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return normalizeBrazilianMobile(digits);
}

// Formas possiveis do mesmo numero em leads/clientes (sem DDI): com e sem o 9o digito, ja que
// cadastros antigos podem ter o celular de 8 digitos.
export function telefoneNacionalCandidatos(telefoneNormalizado: string) {
  const digits = String(telefoneNormalizado || '').replace(/\D/g, '');
  const nacional = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const candidatos = new Set([nacional]);
  if (nacional.length === 11 && nacional[2] === '9') {
    candidatos.add(`${nacional.slice(0, 2)}${nacional.slice(3)}`);
  }
  return [...candidatos];
}
