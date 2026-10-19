import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './propostaDocumento.css';

const FORMA_PAGAMENTO_LABEL = {
  a_vista: 'A vista',
  financiamento: 'Financiamento',
  consorcio: 'Consorcio',
  troca: 'Troca',
};

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function Campo({ label, valor }) {
  return (
    <div className="flex items-baseline gap-1 text-[9.5pt]">
      <span className="shrink-0 text-slate-600">{label}</span>
      <span className="font-bold">{valor || '-'}</span>
    </div>
  );
}

export default function PropostaDocumento({ proposta, veiculoLabel, leadNome, leadTelefone, vendedorNome, onVoltar }) {
  const veiculo = proposta.veiculo_estoque_id ? veiculoLabel : (proposta.veiculo_descricao || '-');

  return (
    <div>
      <div className="no-print mb-4 flex justify-between rounded-lg border border-border bg-card p-3">
        <Button type="button" variant="outline" size="sm" onClick={onVoltar}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button type="button" variant="default" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Salvar PDF
        </Button>
      </div>

      <div className="doc-sheet mx-auto shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b-2 border-black pb-2">
          <div className="text-[20pt] font-black leading-none">MACOM</div>
          <div className="text-right text-[9pt]">
            <div className="font-bold">Proposta Comercial</div>
            <div>{formatDate(new Date())}</div>
          </div>
        </div>

        <div className="mt-3 bg-[#E9E9E9] px-2 py-1 text-[9pt] font-bold uppercase tracking-wide">
          Status: {STATUS_LABEL[proposta.status] || proposta.status}
        </div>

        <div className="mt-3 space-y-1 border border-black p-2">
          <div className="text-[8.5pt] font-bold uppercase text-slate-600">Cliente / Lead</div>
          <Campo label="Nome:" valor={leadNome} />
          <Campo label="Telefone:" valor={leadTelefone} />
        </div>

        <div className="mt-3 space-y-1 border border-black p-2">
          <div className="text-[8.5pt] font-bold uppercase text-slate-600">Veiculo</div>
          <Campo label="Veiculo:" valor={veiculo} />
        </div>

        <div className="mt-3 border border-black">
          <div className="bg-[#1a1a1a] px-2 py-1 text-[8.5pt] font-bold uppercase text-white">Valores</div>
          <div className="grid grid-cols-2 gap-2 p-2">
            <Campo label="Valor do veiculo:" valor={formatCurrency(proposta.valor_veiculo)} />
            <Campo label="Desconto:" valor={formatCurrency(proposta.desconto_valor)} />
            <Campo label="Valor final:" valor={formatCurrency(proposta.valor_final)} />
            <Campo label="Entrada:" valor={formatCurrency(proposta.valor_entrada)} />
            <Campo label="Forma de pagamento:" valor={FORMA_PAGAMENTO_LABEL[proposta.forma_pagamento] || proposta.forma_pagamento} />
            <Campo label="Validade:" valor={proposta.validade_ate ? formatDate(proposta.validade_ate) : '-'} />
          </div>
        </div>

        {proposta.observacoes ? (
          <div className="mt-3 border border-black p-2">
            <div className="text-[8.5pt] font-bold uppercase text-slate-600">Observacoes</div>
            <div className="mt-1 whitespace-pre-wrap text-[9.5pt]">{proposta.observacoes}</div>
          </div>
        ) : null}

        <div className="mt-3">
          <Campo label="Vendedor responsavel:" valor={vendedorNome} />
        </div>

        <div className="mt-10 flex justify-between gap-6 text-center text-[9pt]">
          <div className="flex-1">
            <div className="doc-line" />
            <div className="mt-1">Assinatura do cliente</div>
          </div>
          <div className="flex-1">
            <div className="doc-line" />
            <div className="mt-1">Assinatura do vendedor</div>
          </div>
        </div>
      </div>
    </div>
  );
}
