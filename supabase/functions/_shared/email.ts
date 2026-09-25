// Transporte e enfileiramento de e-mail compartilhados por todas as Edge Functions.
// Qualquer domínio (*-api) que precisar notificar por e-mail deve usar `enqueueEmail`
// para gravar na fila `notificacoes.fila_emails` em vez de duplicar SQL de insert.
// O envio de fato é feito de forma assíncrona pelo worker `processa-fila-email` (cron).

// Credenciais do Gmail: unica fonte e' a tabela `integracoes.integracoes` (chave
// "gmail_notificacoes", configuravel via tela no Console). Nao ha mais fallback pras
// env vars GMAIL_* — migradas e removidas em 2026-09-02.
import { loadIntegracaoCredenciais, type IntegracaoCredenciaisContext } from './integracoes.ts';

export type { IntegracaoCredenciaisContext };

function toBase64Utf8(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function encodeBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeaderUtf8(input: string) {
  return `=?UTF-8?B?${toBase64Utf8(input)}?=`;
}

function wrapBase64(input: string) {
  return String(input || '').replace(/(.{1,76})/g, '$1\r\n').trim();
}

async function getGmailAccessToken(credenciais: Record<string, unknown> | null) {
  const gmailClientId = credenciais?.client_id as string;
  const gmailClientSecret = credenciais?.client_secret as string;
  const gmailRefreshToken = credenciais?.refresh_token as string;

  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    throw new Error('Integracao "gmail_notificacoes" nao configurada ou incompleta (Console > Integracoes).');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: gmailClientId,
      client_secret: gmailClientSecret,
      refresh_token: gmailRefreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    const tokenError = [
      tokenData.error,
      tokenData.error_description,
    ].filter(Boolean).join(' - ');
    throw new Error(`Falha ao obter access token Gmail: ${tokenError || tokenResponse.statusText}`);
  }

  return tokenData.access_token as string;
}

export async function sendGmail(payload: Record<string, unknown>, ctx: IntegracaoCredenciaisContext = {}) {
  const credenciais = await loadIntegracaoCredenciais('gmail_notificacoes', ctx);
  const gmailSender = credenciais?.sender as string;
  if (!gmailSender) {
    throw new Error('Integracao "gmail_notificacoes" nao configurada ou incompleta (Console > Integracoes).');
  }

  const to = typeof payload.to === 'string' ? payload.to : '';
  const subject = typeof payload.subject === 'string' ? payload.subject : '';
  const bodyText = typeof payload.body_text === 'string' ? payload.body_text : '';
  const bodyHtml = typeof payload.body_html === 'string' ? payload.body_html : '';
  const filename = typeof payload.filename === 'string' ? payload.filename : '';
  const rawPdfBase64 = typeof payload.pdf_base64 === 'string' ? payload.pdf_base64 : '';
  const pdfBase64 = rawPdfBase64.includes(',')
    ? rawPdfBase64.split(',').pop() || ''
    : rawPdfBase64;

  if (!to || !subject || !bodyText) {
    throw new Error('Payload incompleto para envio Gmail.');
  }

  const hasAttachment = Boolean(filename && pdfBase64);
  const accessToken = await getGmailAccessToken(credenciais);

  const boundary = 'boundary_macom_termo';
  const altBoundary = 'boundary_macom_alt';
  const rawHtmlBody =
    bodyHtml || `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;">${bodyText}</pre>`;
  const plainBodyBase64 = toBase64Utf8(bodyText);
  const htmlBodyBase64 = toBase64Utf8(rawHtmlBody);

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(plainBodyBase64),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(htmlBodyBase64),
    '',
    `--${altBoundary}--`,
  ].join('\r\n');

  const rawMessage = hasAttachment
    ? [
        `From: ${gmailSender}`,
        `To: ${to}`,
        `Subject: ${encodeMimeHeaderUtf8(subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        alternativePart,
        '',
        `--${boundary}`,
        `Content-Type: application/pdf; name="${filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        wrapBase64(pdfBase64),
        '',
        `--${boundary}--`,
      ].join('\r\n')
    : [
        `From: ${gmailSender}`,
        `To: ${to}`,
        `Subject: ${encodeMimeHeaderUtf8(subject)}`,
        'MIME-Version: 1.0',
        alternativePart,
      ].join('\r\n');

  const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodeBase64Url(rawMessage) }),
  });

  const gmailData = await gmailResponse.json().catch(() => ({}));
  if (!gmailResponse.ok) {
    const gmailError = gmailData?.error || {};
    const details = [
      gmailError.status,
      gmailError.message,
      Array.isArray(gmailError.details) ? JSON.stringify(gmailError.details) : null,
    ].filter(Boolean).join(' - ');
    throw new Error(`Falha ao enviar email pelo Gmail API: ${details || gmailResponse.statusText}`);
  }

  return gmailData.id as string;
}

export interface EnqueueEmailInput {
  tipo: string;
  destinatario: string;
  assunto: string;
  bodyText: string;
  bodyHtml?: string;
  agendadoEm?: string;
  maxTentativas?: number;
}

// `sql` é o cliente postgres.js já usado pelas *-api (ex.: `sql` de servicos-api). Precisa expor
// `sql.json()` (helper nativo do postgres.js) para o payload ser gravado como jsonb de verdade --
// passar uma string pre-serializada com `::jsonb` gravou um jsonb escalar (string dentro de string)
// em vez de objeto, quebrando o parse em sendGmail (ver EMAIL_NOTIFICACOES_STATUS.md).
type SqlTag = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>) & {
  json?: (value: unknown) => unknown;
};

// Mantém o mesmo formato de payload que `sendGmail`/`processa-fila-email` já esperam.
export async function enqueueEmail(
  sql: SqlTag,
  input: EnqueueEmailInput,
) {
  const payload = {
    to: input.destinatario,
    subject: input.assunto,
    body_text: input.bodyText,
    ...(input.bodyHtml ? { body_html: input.bodyHtml } : {}),
  };

  await sql`
    insert into notificacoes.fila_emails (tipo, destinatario, assunto, payload, agendado_em, max_tentativas)
    values (
      ${input.tipo},
      ${input.destinatario},
      ${input.assunto},
      ${sql.json!(payload)},
      coalesce(${input.agendadoEm ?? null}::timestamptz, now()),
      coalesce(${input.maxTentativas ?? null}, 5)
    );
  `;
}
