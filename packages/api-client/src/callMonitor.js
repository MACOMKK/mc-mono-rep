// Monitor de chamadas as Edge Functions (dev E producao).
//
// Objetivo: quando o sistema "travar", saber na hora QUAL API, QUAL action e EM QUE HORARIO,
// para cruzar com os logs do Supabase (Edge Functions -> Logs) e com o pg_stat_activity.
//
// - Guarda as ultimas MAX_ENTRIES chamadas em memoria (some ao recarregar a pagina).
// - Emite console.warn sozinho quando a chamada e lenta (>= SLOW_CALL_MS), da timeout,
//   falha de rede ou volta erro 5xx. Erros 4xx (validacao, permissao) sao regra de negocio
//   e NAO geram aviso; cancelamentos intencionais (React Query) tambem nao.
//
// No console do navegador (F12):
//   macomApiLog()            -> tabela com todas as chamadas guardadas
//   macomApiLog.problemas()  -> so as lentas / com erro
//   macomApiLog.clear()      -> zera

const SLOW_CALL_MS = 5000;
const MAX_ENTRIES = 300;
const entries = [];

function horaLocal(date) {
  return date.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

function describeCall(body) {
  if (!body || typeof body !== 'object') return '';
  return [body.resource, body.action, body.entity].filter(Boolean).join(':');
}

function isProblem(entry) {
  return entry.lenta || entry.problema;
}

if (typeof window !== 'undefined' && !window.macomApiLog) {
  window.macomApiLog = () => {
    console.table(entries);
    return entries.length;
  };
  window.macomApiLog.problemas = () => {
    const list = entries.filter(isProblem);
    console.table(list);
    return list.length;
  };
  window.macomApiLog.clear = () => {
    entries.length = 0;
  };
}

function classifyError(error) {
  if (error?.name === 'AbortError' && !error?.code) return { status: 'cancelada', problema: false };
  const status = error?.status;
  if (error?.code === 'timeout') return { status: 'timeout', problema: true };
  if (typeof status === 'number' && status >= 500) return { status, problema: true };
  if (typeof status === 'number' && status > 0) return { status, problema: false };
  // Sem status HTTP: falha de rede / CORS / function fora do ar.
  return { status: 'falha_rede', problema: true };
}

function record(api, body, startedAtDate, startedAtPerf, status, problema, error) {
  const duracaoMs = Math.round(performance.now() - startedAtPerf);
  const entry = {
    horario: horaLocal(startedAtDate),
    api,
    chamada: describeCall(body),
    duracao_ms: duracaoMs,
    status,
    lenta: duracaoMs >= SLOW_CALL_MS,
    problema,
    erro: error ? String(error?.message || error).slice(0, 200) : '',
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  if (isProblem(entry)) {
    const motivo = problema ? `falhou (${status})` : 'lenta';
    console.warn(
      `[macom-api] ${api} ${entry.chamada || '(sem action)'} ${motivo} em ${duracaoMs} ms` +
        ` | inicio ${entry.horario} | ${startedAtDate.toISOString()}` +
        (entry.erro ? ` | ${entry.erro}` : ''),
    );
  }
}

/**
 * Executa `run()` (a chamada HTTP de fato) registrando tempo, status e horario.
 * Nao altera o resultado nem o erro: so observa.
 */
export async function monitorCall(api, body, run) {
  const startedAtDate = new Date();
  const startedAtPerf = performance.now();
  try {
    const result = await run();
    record(api, body, startedAtDate, startedAtPerf, 'ok', false);
    return result;
  } catch (error) {
    const { status, problema } = classifyError(error);
    record(api, body, startedAtDate, startedAtPerf, status, problema, status === 'cancelada' ? null : error);
    throw error;
  }
}
