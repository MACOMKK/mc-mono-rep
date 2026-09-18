export const AVARIA_TIPOS = [
  { key: 'quebrado', label: 'Quebrado', simbolo: '#' },
  { key: 'amassado', label: 'Amassado', simbolo: '⚡' },
  { key: 'riscado', label: 'Riscado', simbolo: '/' },
  { key: 'mancha', label: 'Mancha', simbolo: 'Θ' },
];

export const DOCUMENTACAO_ITENS = [
  'Manual do Proprietário',
  'Livreto de Manutenção',
  'Documentação do Veículo',
];

export const SEGURANCA_ITENS = ['Triângulo', 'Chave de Roda', 'Macaco', 'Estepe', 'Tapete'];

export const PNEUS = ['DD', 'DE', 'TD', 'TE'];

export const CATEGORIA_LABEL = {
  documentacao: 'Documentação',
  seguranca: 'Segurança',
  pneus: 'Pneus',
};

export const CATEGORIA_ITENS = {
  documentacao: DOCUMENTACAO_ITENS,
  seguranca: SEGURANCA_ITENS,
  pneus: PNEUS,
};

export const NIVEIS_COMBUSTIVEL = [
  { valor: 0, label: 'V' },
  { valor: 0.25, label: '1/4' },
  { valor: 0.5, label: '1/2' },
  { valor: 0.75, label: '3/4' },
  { valor: 1, label: 'C' },
];

export const FOTO_CATEGORIAS = [
  'Frente',
  'Traseira',
  'Lateral direita',
  'Lateral esquerda',
  'Interna',
  'Painel / Km',
  'Motor',
  'Porta-malas',
  'Rodas / Pneus',
  'Avaria',
  'Outros',
];

export const MAX_FOTOS = 10;

export const STATUS_DOC_SEG = { OK: 'Conforme', AS: 'Ausente', AV: 'Avariado' };

export const STATUS_PNEU = {
  ok: 'Dentro das especificações',
  atencao: 'Atenção',
  risco: 'Risco à segurança',
};

export function statusOptionsPorCategoria(categoria) {
  return categoria === 'pneus'
    ? Object.entries(STATUS_PNEU).map(([value, label]) => ({ value, label }))
    : Object.entries(STATUS_DOC_SEG).map(([value, label]) => ({ value, label }));
}
