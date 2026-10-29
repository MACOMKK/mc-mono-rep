// Rascunho local da Nova Solicitação (só neste navegador): protege o preenchimento contra um
// reload acidental. Anexos (File) não entram -- não cabem no localStorage. Toda leitura/escrita
// é best-effort: em modo privado ou com storage cheio, o formulário segue funcionando sem rascunho.
const PREFIXO = 'servicos:rascunho-solicitacao:';
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function chave(colaboradorId) {
  return colaboradorId ? `${PREFIXO}${colaboradorId}` : null;
}

export function lerRascunhoSolicitacao(colaboradorId) {
  const key = chave(colaboradorId);
  if (!key) return null;
  try {
    const bruto = window.localStorage.getItem(key);
    if (!bruto) return null;
    const rascunho = JSON.parse(bruto);
    if (!rascunho?.form || !rascunho.salvoEm || Date.now() - rascunho.salvoEm > VALIDADE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return rascunho;
  } catch {
    return null;
  }
}

export function salvarRascunhoSolicitacao(colaboradorId, dados) {
  const key = chave(colaboradorId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...dados, salvoEm: Date.now() }));
  } catch {
    // storage indisponível/cheio: segue sem rascunho
  }
}

export function limparRascunhoSolicitacao(colaboradorId) {
  const key = chave(colaboradorId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignora
  }
}
