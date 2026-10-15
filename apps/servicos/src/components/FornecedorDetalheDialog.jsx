import { useQuery } from '@tanstack/react-query';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Spinner } from '@macom/ui';
import CopyButton from '@/components/CopyButton';
import { getFriendlyErrorMessage } from '@/lib/errorMessage';
import { formatCep, formatDocumento, formatTelefone } from '@/lib/financeiroFormat';

const TIPO_PESSOA_LABEL = { fisica: 'Pessoa física', juridica: 'Pessoa jurídica' };

function Campo({ label, value, copiavel = false, className = '' }) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium break-words">{value || '-'}</p>
        {copiavel && value && <CopyButton value={value} label={`Copiar ${label.toLowerCase()}`} />}
      </div>
    </div>
  );
}

// Ficha somente leitura do fornecedor de uma solicitacao (action get_fornecedor_solicitacao).
// Existe pra quem paga consultar os dados sem sair do drawer; o atalho leva a tela /fornecedores
// (gestao pro financeiro, somente consulta pro contas a pagar).
export default function FornecedorDetalheDialog({ open, onOpenChange, solicitacaoId, podeGerenciar = false, onGerenciar }) {
  const fornecedorQuery = useQuery({
    queryKey: ['servicos', 'fornecedor-solicitacao', solicitacaoId],
    queryFn: () => financeiroApi.fornecedores.getDaSolicitacao(solicitacaoId),
    enabled: open && Boolean(solicitacaoId),
  });
  const fornecedor = fornecedorQuery.data;

  const enderecoCompleto = fornecedor
    ? [fornecedor.endereco, [fornecedor.cidade, fornecedor.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados do fornecedor</DialogTitle>
        </DialogHeader>

        {fornecedorQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : fornecedorQuery.isError ? (
          <p className="py-4 text-sm text-destructive">{getFriendlyErrorMessage(fornecedorQuery.error)}</p>
        ) : fornecedor ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start justify-between gap-2 sm:col-span-2">
              <Campo label="Nome" value={fornecedor.nome} copiavel />
              {fornecedor.ativo === false && <Badge variant="secondary">Inativo</Badge>}
            </div>
            <Campo label="Tipo de pessoa" value={TIPO_PESSOA_LABEL[fornecedor.tipo_pessoa]} />
            <Campo label="CPF/CNPJ" value={fornecedor.documento ? formatDocumento(fornecedor.documento) : ''} copiavel />
            <Campo label="Inscrição estadual" value={fornecedor.inscricao_estadual} />
            <Campo label="Telefone" value={fornecedor.telefone ? formatTelefone(fornecedor.telefone) : ''} copiavel />
            <Campo label="E-mail" value={fornecedor.email} copiavel className="sm:col-span-2" />
            <Campo label="Endereço" value={enderecoCompleto} className="sm:col-span-2" />
            <Campo label="CEP" value={fornecedor.cep ? formatCep(fornecedor.cep) : ''} />
          </div>
        ) : null}

        {podeGerenciar && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onGerenciar}>
              Abrir tela de fornecedores
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
