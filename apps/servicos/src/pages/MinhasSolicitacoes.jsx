import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, FileWarning, Pencil, Plus, RefreshCw, X } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import {
  buildSolicitacaoSearchText,
  formatDataVencimento,
  formatValor,
  FORMA_PAGAMENTO_LABEL,
  isBloqueadaPorPendencia,
  isParcialmentePago,
  STATUS_LABEL,
  STATUS_VARIANT,
  toDateOnly,
  truncarTitulo,
} from '@/lib/financeiroFormat';
import SolicitacaoDrawer from '@/components/SolicitacaoDrawer';
import SolicitacaoCard from '@/components/SolicitacaoCard';
import NovaSolicitacaoDrawer from '@/components/NovaSolicitacaoDrawer';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import FiltersDrawer from '@/components/FiltersDrawer';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import ValorRangeFilter from '@/components/ValorRangeFilter';
import VencimentoRangeFilter from '@/components/VencimentoRangeFilter';
import { useCategorias, useEmpresas } from '@/hooks/useCatalogos';
import { usePagination } from '@/hooks/usePagination';
import { normalize } from '@/lib/normalize';

const CATEGORIA_FILTRO_TODAS = 'todas';
const SOLICITANTE_FILTRO_TODOS = 'todos';
const APROVADOR_FILTRO_TODOS = 'todos';
const EMPRESA_FILTRO_TODAS = 'todas';
const UNIDADE_FILTRO_TODAS = 'todas';
const FORNECEDOR_FILTRO_TODOS = 'todos';
const FORNECEDOR_FILTRO_SUPRIMENTO_CAIXA = 'suprimento_caixa';
const FORMA_PAGAMENTO_FILTRO_TODAS = 'todas';

export default function MinhasSolicitacoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categorias = [] } = useCategorias();
  const { data: empresas = [] } = useEmpresas();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [formTarget, setFormTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [reprovarTarget, setReprovarTarget] = useState(null);
  const [reprovarMotivo, setReprovarMotivo] = useState('');
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState(CATEGORIA_FILTRO_TODAS);
  const [solicitanteFiltro, setSolicitanteFiltro] = useState(SOLICITANTE_FILTRO_TODOS);
  const [aprovadorFiltro, setAprovadorFiltro] = useState(APROVADOR_FILTRO_TODOS);
  const [empresaFiltro, setEmpresaFiltro] = useState(EMPRESA_FILTRO_TODAS);
  const [unidadeFiltro, setUnidadeFiltro] = useState(UNIDADE_FILTRO_TODAS);
  const [fornecedorFiltro, setFornecedorFiltro] = useState(FORNECEDOR_FILTRO_TODOS);
  const [formaPagamentoFiltro, setFormaPagamentoFiltro] = useState(FORMA_PAGAMENTO_FILTRO_TODAS);
  const [valorFiltro, setValorFiltro] = useState(null);
  const [valorResetToken, setValorResetToken] = useState(0);
  const [vencimentoFiltro, setVencimentoFiltro] = useState(null);
  const [vencimentoResetToken, setVencimentoResetToken] = useState(0);

  const solicitacoesQuery = useQuery({
    queryKey: ['servicos', 'solicitacoes', 'minhas'],
    queryFn: () => financeiroApi.solicitacoes.list(),
  });
  const rows = solicitacoesQuery.data || [];
  const loading = solicitacoesQuery.isLoading;
  const selected = rows.find((row) => row.id === selectedId) || null;

  // Resolve o link de compartilhamento (?sol=<id>, gerado pelo WhatsAppShareButton no drawer):
  // abre a solicitacao automaticamente ao carregar. So roda uma vez, depois que a lista carrega.
  const linkCompartilhadoResolvidoRef = useRef(false);
  useEffect(() => {
    if (linkCompartilhadoResolvidoRef.current || loading) return;
    const solId = searchParams.get('sol');
    linkCompartilhadoResolvidoRef.current = true;
    if (!solId) return;

    if (rows.some((row) => row.id === solId)) {
      setSelectedId(solId);
    } else {
      toast({
        title: 'Solicitação não encontrada',
        description: 'Ela pode ter sido removida ou você não tem acesso a ela.',
      });
    }
    setSearchParams(
      (params) => {
        params.delete('sol');
        return params;
      },
      { replace: true },
    );
  }, [loading, rows, searchParams, setSearchParams, toast]);

  const solicitantes = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.solicitante_id && !porId.has(row.solicitante_id)) {
        porId.set(row.solicitante_id, row.solicitante_nome);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const aprovadores = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.aprovador_destino_id && !porId.has(row.aprovador_destino_id)) {
        porId.set(row.aprovador_destino_id, row.aprovador_destino_nome);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const fornecedores = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.fornecedor_id && !porId.has(row.fornecedor_id)) {
        porId.set(row.fornecedor_id, row.fornecedor);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const unidades = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.unidade_id && !porId.has(row.unidade_id)) {
        porId.set(row.unidade_id, row.unidade_nome);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const colaboradoresBeneficiarios = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.tipo_beneficiario === 'colaborador' && row.colaborador_beneficiario_id && !porId.has(row.colaborador_beneficiario_id)) {
        porId.set(row.colaborador_beneficiario_id, row.fornecedor);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const filteredRows = rows.filter((row) => {
    if (statusFiltro.length > 0 && !statusFiltro.includes(row.status)) return false;
    if (categoriaFiltro !== CATEGORIA_FILTRO_TODAS && row.categoria_id !== categoriaFiltro) return false;
    if (solicitanteFiltro !== SOLICITANTE_FILTRO_TODOS && String(row.solicitante_id) !== solicitanteFiltro) return false;
    if (aprovadorFiltro !== APROVADOR_FILTRO_TODOS && String(row.aprovador_destino_id) !== aprovadorFiltro) return false;
    if (empresaFiltro !== EMPRESA_FILTRO_TODAS && String(row.empresa_id) !== empresaFiltro) return false;
    if (unidadeFiltro !== UNIDADE_FILTRO_TODAS && String(row.unidade_id) !== unidadeFiltro) return false;
    if (fornecedorFiltro === FORNECEDOR_FILTRO_SUPRIMENTO_CAIXA) {
      if (row.tipo_beneficiario !== 'colaborador') return false;
    } else if (
      fornecedorFiltro !== FORNECEDOR_FILTRO_TODOS &&
      String(row.fornecedor_id) !== fornecedorFiltro &&
      String(row.colaborador_beneficiario_id) !== fornecedorFiltro
    ) {
      return false;
    }
    if (formaPagamentoFiltro !== FORMA_PAGAMENTO_FILTRO_TODAS && row.forma_pagamento !== formaPagamentoFiltro) {
      return false;
    }
    if (valorFiltro) {
      const valor = Number(row.valor || 0);
      if (valor < valorFiltro.min || valor > valorFiltro.max) return false;
    }
    if (vencimentoFiltro) {
      const dia = toDateOnly(row.vencimento_efetivo);
      if (!dia || dia < vencimentoFiltro.from || dia > vencimentoFiltro.to) return false;
    }
    const termo = normalize(busca);
    if (!termo) return true;
    return normalize(buildSolicitacaoSearchText(row)).includes(termo);
  });
  // Pendente/aprovado ficam primeiro (prioridade 0), ordenados por vencimento crescente;
  // encerrados vao pro final, agrupados entre si na ordem pago -> reprovado -> cancelado, cada
  // grupo tambem ordenado por vencimento crescente.
  const STATUS_PRIORIDADE_FINAL = { pago: 1, reprovado: 2, cancelado: 3 };
  const sortedRows = filteredRows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aPrioridade = STATUS_PRIORIDADE_FINAL[a.row.status] || 0;
      const bPrioridade = STATUS_PRIORIDADE_FINAL[b.row.status] || 0;
      if (aPrioridade !== bPrioridade) return aPrioridade - bPrioridade;
      const aVenc = toDateOnly(a.row.vencimento_efetivo);
      const bVenc = toDateOnly(b.row.vencimento_efetivo);
      if (aVenc && bVenc && aVenc !== bVenc) return aVenc < bVenc ? -1 : 1;
      if (aVenc && !bVenc) return -1;
      if (!aVenc && bVenc) return 1;
      return a.index - b.index;
    })
    .map(({ row }) => row);
  const { page, setPage, pageItems, total } = usePagination(sortedRows, 15);

  const minhasSolicitacoesKey = ['servicos', 'solicitacoes', 'minhas'];

  const cancelarMutation = useMutation({
    mutationFn: ({ id, motivo }) => financeiroApi.solicitacoes.cancelar(id, motivo),
    onMutate: ({ id }) => {
      const previous = queryClient.getQueryData(minhasSolicitacoesKey);
      queryClient.setQueryData(minhasSolicitacoesKey, (old) =>
        (old || []).map((row) => (row.id === id ? { ...row, status: 'cancelado' } : row)),
      );
      setCancelTarget(null);
      setCancelMotivo('');
      setSelectedId(null);
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Solicitação cancelada' });
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(minhasSolicitacoesKey, context.previous);
      toast({ title: 'Não foi possível cancelar a solicitação', description: `${error.message} Tente novamente.` });
    },
  });

  const reprovarMutation = useMutation({
    mutationFn: ({ id, motivo }) => financeiroApi.solicitacoes.setStatus(id, 'reprovado', motivo),
    onMutate: ({ id }) => {
      const previous = queryClient.getQueryData(minhasSolicitacoesKey);
      queryClient.setQueryData(minhasSolicitacoesKey, (old) =>
        (old || []).map((row) => (row.id === id ? { ...row, status: 'reprovado' } : row)),
      );
      setReprovarTarget(null);
      setReprovarMotivo('');
      setSelectedId(null);
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Solicitação reprovada' });
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(minhasSolicitacoesKey, context.previous);
      toast({ title: 'Não foi possível reprovar a solicitação', description: `${error.message} Tente novamente.` });
    },
  });

  const title = 'Solicitações';

  function handleCancelar() {
    if (!cancelTarget) return;
    cancelarMutation.mutate({ id: cancelTarget.id, motivo: cancelMotivo.trim() || null });
  }

  function handleReprovar() {
    if (!reprovarTarget || !reprovarMotivo.trim()) return;
    reprovarMutation.mutate({ id: reprovarTarget.id, motivo: reprovarMotivo.trim() });
  }

  const isDono = (row) => String(row.solicitante_id) === String(user?.collaborator?.id);
  const isAprovadorDestino = (row) =>
    user?.isAprovador && String(row.aprovador_destino_id) === String(user?.collaborator?.id);

  const activeFilterCount = [
    statusFiltro.length > 0,
    categoriaFiltro !== CATEGORIA_FILTRO_TODAS,
    solicitanteFiltro !== SOLICITANTE_FILTRO_TODOS,
    aprovadorFiltro !== APROVADOR_FILTRO_TODOS,
    empresaFiltro !== EMPRESA_FILTRO_TODAS,
    unidadeFiltro !== UNIDADE_FILTRO_TODAS,
    fornecedorFiltro !== FORNECEDOR_FILTRO_TODOS,
    formaPagamentoFiltro !== FORMA_PAGAMENTO_FILTRO_TODAS,
    Boolean(valorFiltro),
    Boolean(vencimentoFiltro),
  ].filter(Boolean).length;

  function handleClearFiltros() {
    setStatusFiltro([]);
    setCategoriaFiltro(CATEGORIA_FILTRO_TODAS);
    setSolicitanteFiltro(SOLICITANTE_FILTRO_TODOS);
    setAprovadorFiltro(APROVADOR_FILTRO_TODOS);
    setEmpresaFiltro(EMPRESA_FILTRO_TODAS);
    setUnidadeFiltro(UNIDADE_FILTRO_TODAS);
    setFornecedorFiltro(FORNECEDOR_FILTRO_TODOS);
    setFormaPagamentoFiltro(FORMA_PAGAMENTO_FILTRO_TODAS);
    setValorFiltro(null);
    setValorResetToken((current) => current + 1);
    setVencimentoFiltro(null);
    setVencimentoResetToken((current) => current + 1);
  }

  function renderFooter() {
    if (!selected) return null;
    if (selected.status === 'pendente' && isDono(selected)) {
      return (
        <div className="flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setFormTarget(selected)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setCancelTarget(selected)}>
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
        </div>
      );
    }
    if (isBloqueadaPorPendencia(selected) && isDono(selected)) {
      return (
        <Button className="w-full" onClick={() => setFormTarget(selected)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
      );
    }
    if (selected.status === 'reprovado' && isDono(selected)) {
      return (
        <Button className="w-full" onClick={() => setFormTarget(selected)}>
          <Pencil className="mr-2 h-4 w-4" />
          Corrigir e reenviar
        </Button>
      );
    }
    if (selected.status === 'aprovado' && (user?.isFinanceiro || isAprovadorDestino(selected))) {
      return (
        <Button variant="outline" className="w-full" onClick={() => setReprovarTarget(selected)}>
          <X className="mr-2 h-4 w-4" />
          Reprovar
        </Button>
      );
    }
    if (selected.status === 'pago' && user?.isFinanceiro) {
      return (
        <Button variant="outline" className="w-full" onClick={() => setCancelTarget(selected)}>
          <X className="mr-2 h-4 w-4" />
          Cancelar pagamento
        </Button>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova solicitação
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 sm:w-64">
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar..." />
        </div>

        <div className="w-48 space-y-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal">
                {statusFiltro.length === 0
                  ? 'Todos os status'
                  : statusFiltro.length === 1
                    ? STATUS_LABEL[statusFiltro[0]] || statusFiltro[0]
                    : `${statusFiltro.length} status selecionados`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={statusFiltro.includes(value)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    setStatusFiltro((current) =>
                      checked ? [...current, value] : current.filter((item) => item !== value),
                    )
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <FiltersDrawer activeCount={activeFilterCount} onClear={handleClearFiltros}>
          <Select value={empresaFiltro} onValueChange={setEmpresaFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPRESA_FILTRO_TODAS}>Todas as empresas</SelectItem>
              {empresas.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNIDADE_FILTRO_TODAS}>Todas as unidades</SelectItem>
              {unidades.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATEGORIA_FILTRO_TODAS}>Todas as categorias</SelectItem>
              {categorias.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(user?.isAprovador || user?.isPagador) && (
            <Select value={solicitanteFiltro} onValueChange={setSolicitanteFiltro}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SOLICITANTE_FILTRO_TODOS}>Todos os solicitantes</SelectItem>
                {solicitantes.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(user?.isAprovador || user?.isPagador) && (
            <Select value={aprovadorFiltro} onValueChange={setAprovadorFiltro}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={APROVADOR_FILTRO_TODOS}>Todos os aprovadores</SelectItem>
                {aprovadores.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={fornecedorFiltro} onValueChange={setFornecedorFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FORNECEDOR_FILTRO_TODOS}>Todos os beneficiários</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Suprimento de caixa</SelectLabel>
                <SelectItem value={FORNECEDOR_FILTRO_SUPRIMENTO_CAIXA}>Todos (suprimento de caixa)</SelectItem>
                {colaboradoresBeneficiarios.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
              {fornecedores.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Fornecedores</SelectLabel>
                    {fornecedores.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={formaPagamentoFiltro} onValueChange={setFormaPagamentoFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FORMA_PAGAMENTO_FILTRO_TODAS}>Todas as formas de pagamento</SelectItem>
              {Object.entries(FORMA_PAGAMENTO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <VencimentoRangeFilter onChange={setVencimentoFiltro} resetToken={vencimentoResetToken} />

          <ValorRangeFilter onChange={setValorFiltro} resetToken={valorResetToken} />
        </FiltersDrawer>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Carregando...
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? 'Nenhuma solicitação encontrada.' : 'Nenhuma solicitação corresponde à pesquisa.'}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Forma de pagamento</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead>Aprovador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`cursor-pointer hover:bg-primary/10 ${
                      isBloqueadaPorPendencia(row)
                        ? row.pendencia_atualizada_em
                          ? 'border-l-4 border-l-amber-500 bg-amber-500/5'
                          : 'border-l-4 border-l-destructive bg-destructive/5'
                        : ''
                    }`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-1.5">
                        {isBloqueadaPorPendencia(row) &&
                          (row.pendencia_atualizada_em ? (
                            <RefreshCw className="h-4 w-4 shrink-0 text-amber-600" aria-label="Pendência corrigida, aguardando revisão" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Pendência" />
                          ))}
                        <span className="truncate" title={row.titulo || '-'}>
                          {truncarTitulo(row.titulo)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDataVencimento(row.vencimento_efetivo)}</TableCell>
                    <TableCell>{FORMA_PAGAMENTO_LABEL[row.forma_pagamento] || '-'}</TableCell>
                    <TableCell>{row.categoria || '-'}</TableCell>
                    <TableCell className="font-medium">{row.fornecedor}</TableCell>
                    <TableCell>
                      {row.aprovador_destino_nome || (
                        row.tipo_beneficiario === 'colaborador' ? (
                          <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-sky-600">
                            Auto-aprovado
                          </Badge>
                        ) : (
                          '-'
                        )
                      )}
                    </TableCell>
                    <TableCell>{formatValor(row.valor)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] || row.status}</Badge>
                        {row.status === 'aprovado' && isParcialmentePago(row) && (
                          <Badge variant="outline">
                            Pago parcial ({row.parcelas_pagas}/{row.parcelas_total})
                          </Badge>
                        )}
                        {row.eh_teste && (
                          <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
                            Teste
                          </Badge>
                        )}
                        {row.possui_nota_fiscal === true && Number(row.nota_fiscal_total || 0) === 0 && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600"
                          >
                            <FileWarning className="h-3 w-3" />
                            Aguardando NF
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {pageItems.map((row) => (
              <SolicitacaoCard
                key={row.id}
                row={row}
                onClick={() => setSelectedId(row.id)}
                showSolicitante
                showAprovador
                pendenciaMotivo={isBloqueadaPorPendencia(row) ? row.pendencia_motivo : null}
                pendenciaAtualizada={isBloqueadaPorPendencia(row) && Boolean(row.pendencia_atualizada_em)}
                badges={
                  <>
                    <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] || row.status}</Badge>
                    {row.status === 'aprovado' && isParcialmentePago(row) && (
                      <Badge variant="outline">
                        Pago parcial ({row.parcelas_pagas}/{row.parcelas_total})
                      </Badge>
                    )}
                    {row.eh_teste && (
                      <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
                        Teste
                      </Badge>
                    )}
                    {row.possui_nota_fiscal === true && Number(row.nota_fiscal_total || 0) === 0 && (
                      <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600">
                        <FileWarning className="h-3 w-3" />
                        Aguardando NF
                      </Badge>
                    )}
                    {!row.aprovador_destino_nome && row.tipo_beneficiario === 'colaborador' && (
                      <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-sky-600">
                        Auto-aprovado
                      </Badge>
                    )}
                  </>
                }
              />
            ))}
          </div>

          <Pagination page={page} pageSize={15} total={total} onPageChange={setPage} itemLabel="solicitação(ões)" />
        </>
      )}

      <SolicitacaoDrawer
        solicitacao={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
        footer={renderFooter()}
      />
      <NovaSolicitacaoDrawer open={novaOpen} onOpenChange={setNovaOpen} />
      <NovaSolicitacaoDrawer
        open={Boolean(formTarget)}
        onOpenChange={(open) => !open && setFormTarget(null)}
        solicitacao={formTarget}
      />

      <ConfirmDeleteDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelMotivo('');
          }
        }}
        onConfirm={handleCancelar}
        isLoading={cancelarMutation.isPending}
        confirmDisabled={cancelTarget?.status === 'pago' && !cancelMotivo.trim()}
        title={cancelTarget?.status === 'pago' ? 'Cancelar pagamento' : 'Cancelar solicitação'}
        description={
          cancelTarget?.status === 'pago'
            ? 'Isso cancela uma solicitação já paga — use apenas em caso de erro ou duplicidade. As parcelas já pagas permanecem registradas no histórico. Informe o motivo abaixo.'
            : 'Tem certeza que deseja cancelar esta solicitação? Essa ação não pode ser desfeita.'
        }
        confirmLabel={cancelTarget?.status === 'pago' ? 'Cancelar pagamento' : 'Cancelar solicitação'}
        loadingLabel="Cancelando..."
        cancelLabel="Manter solicitação"
      >
        {cancelTarget?.status === 'pago' && (
          <Textarea
            value={cancelMotivo}
            onChange={(event) => setCancelMotivo(event.target.value)}
            placeholder="Motivo do cancelamento (obrigatório)"
            rows={3}
          />
        )}
      </ConfirmDeleteDialog>

      <ConfirmDeleteDialog
        open={Boolean(reprovarTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReprovarTarget(null);
            setReprovarMotivo('');
          }
        }}
        onConfirm={handleReprovar}
        isLoading={reprovarMutation.isPending}
        confirmDisabled={!reprovarMotivo.trim()}
        title="Reprovar solicitação aprovada"
        description="Isso reverte a aprovação anterior e o solicitante será notificado. Informe o motivo abaixo."
        confirmLabel="Reprovar solicitação"
        loadingLabel="Reprovando..."
        cancelLabel="Manter aprovada"
      >
        <Textarea
          value={reprovarMotivo}
          onChange={(event) => setReprovarMotivo(event.target.value)}
          placeholder="Motivo da reprovação (obrigatório)"
          rows={3}
        />
      </ConfirmDeleteDialog>
    </div>
  );
}
