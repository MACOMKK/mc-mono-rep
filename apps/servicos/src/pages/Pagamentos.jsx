import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, FileWarning, Paperclip, Plus, RefreshCw, Trash2, Unlock, X } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { supabase } from '@macom/api-client/supabaseClient';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from '@macom/ui';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import PaymentSuccessOverlay from '@/components/PaymentSuccessOverlay';
import SolicitacaoDrawer from '@/components/SolicitacaoDrawer';
import SolicitacaoCard from '@/components/SolicitacaoCard';
import FiltersDrawer from '@/components/FiltersDrawer';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import ValorRangeFilter from '@/components/ValorRangeFilter';
import VencimentoRangeFilter from '@/components/VencimentoRangeFilter';
import { useCategorias, useEmpresas } from '@/hooks/useCatalogos';
import { usePagination } from '@/hooks/usePagination';
import { useAuth } from '@/lib/AuthContext';
import { isAllowedAnexoMimeType, MAX_ANEXO_SIZE, uploadAnexo } from '@/lib/anexoUpload';
import { getFriendlyErrorMessage } from '@/lib/errorMessage';
import {
  buildSolicitacaoSearchText,
  formatDataHora,
  formatDataVencimento,
  formatValor,
  FORMA_PAGAMENTO_LABEL,
  getVencimentoInfo,
  isBloqueadaPorPendencia,
  isParcialmentePago,
  STATUS_LABEL,
  STATUS_VARIANT,
  toLocalDateOnly,
  truncarTitulo,
} from '@/lib/financeiroFormat';
import { normalize } from '@/lib/normalize';
import { gerarParcelasAutomaticas } from '@/lib/parcelamento';

const CATEGORIA_FILTRO_TODAS = 'todas';
const CLASSIFICACAO_TODAS = 'todas';
const STATUS_PAGAMENTO_FILTRO_OPCOES = [
  { value: 'aprovado', label: 'Pendentes' },
  { value: 'pago', label: 'Pagas' },
  { value: 'todas', label: 'Todas' },
];
const CLASSIFICACAO_PARCIAL = 'parcial';
const SOLICITANTE_FILTRO_TODOS = 'todos';
const EMPRESA_FILTRO_TODAS = 'todas';
const UNIDADE_FILTRO_TODAS = 'todas';
const FORNECEDOR_FILTRO_TODOS = 'todos';
const FORNECEDOR_FILTRO_SUPRIMENTO_CAIXA = 'suprimento_caixa';
const APROVADOR_FILTRO_TODOS = 'todos';
const FORMA_PAGAMENTO_FILTRO_TODAS = 'todas';

const VENCIMENTO_STATUS_FILTRO_TODOS = 'todos';
const VENCIMENTO_STATUS_OPCOES = [
  { value: 'vencido', label: 'Vencido' },
  { value: 'vence_hoje', label: 'Vence hoje' },
  { value: 'vence_amanha', label: 'Vence amanhã' },
  { value: 'no_prazo', label: 'No prazo' },
  { value: 'sem_vencimento', label: 'Sem vencimento' },
];

export default function Pagamentos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: categorias = [] } = useCategorias();
  const { data: empresas = [] } = useEmpresas();
  const [categoriaFiltro, setCategoriaFiltro] = useState(CATEGORIA_FILTRO_TODAS);
  const [statusPagamentoFiltro, setStatusPagamentoFiltro] = useState('aprovado');
  const [classificacaoFiltro, setClassificacaoFiltro] = useState(CLASSIFICACAO_TODAS);
  const [solicitanteFiltro, setSolicitanteFiltro] = useState(SOLICITANTE_FILTRO_TODOS);
  const [empresaFiltro, setEmpresaFiltro] = useState(EMPRESA_FILTRO_TODAS);
  const [unidadeFiltro, setUnidadeFiltro] = useState(UNIDADE_FILTRO_TODAS);
  const [vencimentoFiltro, setVencimentoFiltro] = useState(null);
  const [vencimentoResetToken, setVencimentoResetToken] = useState(0);
  const [vencimentoStatusFiltro, setVencimentoStatusFiltro] = useState(VENCIMENTO_STATUS_FILTRO_TODOS);
  const [fornecedorFiltro, setFornecedorFiltro] = useState(FORNECEDOR_FILTRO_TODOS);
  const [aprovadorFiltro, setAprovadorFiltro] = useState(APROVADOR_FILTRO_TODOS);
  const [formaPagamentoFiltro, setFormaPagamentoFiltro] = useState(FORMA_PAGAMENTO_FILTRO_TODAS);
  const [valorFiltro, setValorFiltro] = useState(null);
  const [valorResetToken, setValorResetToken] = useState(0);
  const [busca, setBusca] = useState('');

  const [dialogRowId, setDialogRowId] = useState(null);
  const [draftParcelas, setDraftParcelas] = useState([]);
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(2);

  const [reprovarTarget, setReprovarTarget] = useState(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');

  const [pendenciaTarget, setPendenciaTarget] = useState(null);
  const [motivoPendencia, setMotivoPendencia] = useState('');
  const [liberarTarget, setLiberarTarget] = useState(null);

  const [pagamentoTarget, setPagamentoTarget] = useState(null);
  const [comprovantes, setComprovantes] = useState([]);
  const [successOverlay, setSuccessOverlay] = useState(null);

  const solicitacoesQuery = useQuery({
    queryKey: ['servicos', 'solicitacoes', 'aprovadas', categoriaFiltro, statusPagamentoFiltro],
    queryFn: async () => {
      const filters = { order_by: 'data_vencimento' };
      if (statusPagamentoFiltro !== 'todas') filters.status = statusPagamentoFiltro;
      if (categoriaFiltro !== CATEGORIA_FILTRO_TODAS) filters.categoria_id = categoriaFiltro;
      const result = await financeiroApi.solicitacoes.list(filters);
      if (statusPagamentoFiltro !== 'todas') return result;
      return (result || []).filter((row) => row.status === 'aprovado' || row.status === 'pago');
    },
  });
  const rows = solicitacoesQuery.data || [];
  const loading = solicitacoesQuery.isLoading;
  const dialogRow = rows.find((row) => row.id === dialogRowId) || null;

  const [searchParams, setSearchParams] = useSearchParams();
  const solAbertoRef = useRef(false);
  // Resolve o link vindo da notificacao de "solicitacao aprovada, aguardando pagamento"
  // (?sol=<id>) -- mesmo padrao de apps/servicos/src/pages/Aprovacoes.jsx.
  useEffect(() => {
    if (solAbertoRef.current || loading) return;
    const solId = searchParams.get('sol');
    solAbertoRef.current = true;
    if (!solId) return;

    if (rows.some((row) => row.id === solId)) {
      setDialogRowId(solId);
    }
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('sol');
      return params;
    }, { replace: true });
  }, [loading, rows, searchParams, setSearchParams]);

  const parcelasQuery = useQuery({
    queryKey: ['servicos', 'parcelas', dialogRowId],
    queryFn: () => financeiroApi.parcelas.list(dialogRowId),
    enabled: Boolean(dialogRowId),
  });
  const parcelas = parcelasQuery.data || [];

  const realtimeInstanceId = useId();
  // So usa o evento como gatilho pra refazer o fetch (que ja passa pela autorizacao da
  // servicos-api) -- sem isso, aprovacao/reprovacao/pagamento feitos por outro colaborador so
  // apareciam aqui depois de um F5. Invalida tambem as parcelas do drawer aberto, pra refletir
  // pagamento de parcela feito em outra sessao sem precisar fechar/reabrir.
  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`servicos-solicitacoes-pagamentos:${realtimeInstanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'gestao_servicos', table: 'solicitacoes_pagamento' },
        (payload) => {
          console.log('[realtime][pagamentos] evento recebido', payload);
          queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
          if (dialogRowId) {
            queryClient.invalidateQueries({ queryKey: ['servicos', 'parcelas', dialogRowId] });
          }
        },
      )
      .subscribe((status) => {
        console.log('[realtime][pagamentos] status do canal', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dialogRowId, queryClient, realtimeInstanceId]);

  useEffect(() => {
    if (!dialogRowId || !parcelasQuery.data) {
      setDraftParcelas([]);
      return;
    }
    if (parcelasQuery.data.length) {
      setDraftParcelas([]);
      return;
    }
    setQuantidadeParcelas(2);
    setDraftParcelas(
      gerarParcelasAutomaticas({
        valorTotal: dialogRow?.valor,
        dataBase: new Date().toISOString().slice(0, 10),
        quantidade: 2,
      }),
    );
  }, [dialogRowId, parcelasQuery.data]);

  function handleQuantidadeParcelasChange(value) {
    const qtd = Number(value);
    setQuantidadeParcelas(qtd);
    setDraftParcelas(
      gerarParcelasAutomaticas({
        valorTotal: dialogRow?.valor,
        dataBase: new Date().toISOString().slice(0, 10),
        quantidade: qtd,
      }),
    );
  }

  const solicitantes = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.solicitante_id && !porId.has(row.solicitante_id)) {
        porId.set(row.solicitante_id, row.solicitante_nome);
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

  const colaboradoresBeneficiarios = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.tipo_beneficiario === 'colaborador' && row.colaborador_beneficiario_id && !porId.has(row.colaborador_beneficiario_id)) {
        porId.set(row.colaborador_beneficiario_id, row.fornecedor);
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

  const aprovadores = useMemo(() => {
    const porId = new Map();
    rows.forEach((row) => {
      if (row.aprovador_destino_id && !porId.has(row.aprovador_destino_id)) {
        porId.set(row.aprovador_destino_id, row.aprovador_destino_nome);
      }
    });
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  const visibleRows = useMemo(() => {
    let classificadas = classificacaoFiltro !== CLASSIFICACAO_PARCIAL ? rows : rows.filter(isParcialmentePago);
    if (solicitanteFiltro !== SOLICITANTE_FILTRO_TODOS) {
      classificadas = classificadas.filter((row) => String(row.solicitante_id) === solicitanteFiltro);
    }
    if (empresaFiltro !== EMPRESA_FILTRO_TODAS) {
      classificadas = classificadas.filter((row) => String(row.empresa_id) === empresaFiltro);
    }
    if (unidadeFiltro !== UNIDADE_FILTRO_TODAS) {
      classificadas = classificadas.filter((row) => String(row.unidade_id) === unidadeFiltro);
    }
    if (vencimentoFiltro) {
      classificadas = classificadas.filter((row) => {
        const dia = toLocalDateOnly(row.vencimento_efetivo);
        return dia && dia >= vencimentoFiltro.from && dia <= vencimentoFiltro.to;
      });
    }
    if (vencimentoStatusFiltro !== VENCIMENTO_STATUS_FILTRO_TODOS) {
      classificadas = classificadas.filter(
        (row) => getVencimentoInfo(row.vencimento_efetivo).key === vencimentoStatusFiltro,
      );
    }
    if (fornecedorFiltro === FORNECEDOR_FILTRO_SUPRIMENTO_CAIXA) {
      classificadas = classificadas.filter((row) => row.tipo_beneficiario === 'colaborador');
    } else if (fornecedorFiltro !== FORNECEDOR_FILTRO_TODOS) {
      classificadas = classificadas.filter(
        (row) => String(row.fornecedor_id) === fornecedorFiltro || String(row.colaborador_beneficiario_id) === fornecedorFiltro,
      );
    }
    if (aprovadorFiltro !== APROVADOR_FILTRO_TODOS) {
      classificadas = classificadas.filter((row) => String(row.aprovador_destino_id) === aprovadorFiltro);
    }
    if (formaPagamentoFiltro !== FORMA_PAGAMENTO_FILTRO_TODAS) {
      classificadas = classificadas.filter((row) => row.forma_pagamento === formaPagamentoFiltro);
    }
    if (valorFiltro) {
      classificadas = classificadas.filter((row) => {
        const valor = Number(row.valor || 0);
        return valor >= valorFiltro.min && valor <= valorFiltro.max;
      });
    }
    const termo = normalize(busca);
    if (!termo) return classificadas;
    return classificadas.filter((row) => normalize(buildSolicitacaoSearchText(row)).includes(termo));
  }, [
    rows,
    classificacaoFiltro,
    solicitanteFiltro,
    empresaFiltro,
    unidadeFiltro,
    vencimentoFiltro,
    vencimentoStatusFiltro,
    fornecedorFiltro,
    aprovadorFiltro,
    formaPagamentoFiltro,
    valorFiltro,
    busca,
  ]);
  const { page, setPage, pageItems, total } = usePagination(visibleRows, 10);

  const resumo = useMemo(() => {
    // Saldo em aberto: valor total menos o que ja foi pago em parcelas (pagamento parcial
    // continua na lista, com status 'aprovado', ate quitar a ultima parcela).
    const total = visibleRows.reduce((sum, row) => sum + (Number(row.valor || 0) - Number(row.valor_pago || 0)), 0);
    const atrasadas = visibleRows.filter(
      (row) => row.status !== 'pago' && getVencimentoInfo(row.vencimento_efetivo).label === 'Vencido',
    ).length;
    return { total, atrasadas };
  }, [visibleRows]);

  function openPagamentoAVista(row) {
    setPagamentoTarget({ type: 'avista', row });
    setComprovantes([]);
  }

  function openPagamentoParcela(row, parcelaId) {
    setPagamentoTarget({ type: 'parcela', row, parcelaId });
    setComprovantes([]);
  }

  function closePagamentoDialog() {
    setPagamentoTarget(null);
    setComprovantes([]);
  }

  function handleComprovanteChange(event) {
    const files = Array.from(event.target.files || []);
    const tooBig = files.find((file) => file.size > MAX_ANEXO_SIZE);
    if (tooBig) {
      toast({ title: 'Arquivo muito grande', description: `"${tooBig.name}" deve ter no máximo 5 MB.` });
      event.target.value = '';
      return;
    }
    const tipoInvalido = files.find((file) => !isAllowedAnexoMimeType(file));
    if (tipoInvalido) {
      toast({ title: 'Tipo de arquivo não suportado', description: `"${tipoInvalido.name}" deve ser PDF, JPEG, PNG ou WebP.` });
      event.target.value = '';
      return;
    }
    setComprovantes((current) => [...current, ...files]);
    event.target.value = '';
  }

  function removeComprovante(index) {
    setComprovantes((current) => current.filter((_, i) => i !== index));
  }

  function uploadComprovantesEmBackground(solicitacaoId, parcelaId, files) {
    if (!files || files.length === 0) return;

    Promise.allSettled(
      files.map((file) =>
        uploadAnexo({ file, solicitacaoId, tipoAnexo: 'comprovante_pagamento', parcelaId }),
      ),
    ).then((results) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'anexos', solicitacaoId] });
      const falhas = results.filter((result) => result.status === 'rejected');
      if (falhas.length > 0) {
        toast({
          title: falhas.length === 1 ? 'Um comprovante nao foi enviado' : `${falhas.length} comprovantes nao foram enviados`,
          description: `O pagamento foi registrado normalmente, mas houve falha no envio: ${getFriendlyErrorMessage(falhas[0].reason)}.`,
        });
      }
    });
  }

  const confirmarPagamentoMutation = useMutation({
    mutationFn: async ({ type, row, parcelaId }) => {
      let parcelaAlvoId = parcelaId;

      if (type === 'avista') {
        const existentes = await financeiroApi.parcelas.list(row.id);
        const pendente = existentes.find((item) => item.status === 'pendente');
        if (pendente) {
          parcelaAlvoId = pendente.id;
        } else {
          const created = await financeiroApi.parcelas.criar(row.id, [
            { valor: Number(row.valor), data_vencimento: row.data_vencimento || null },
          ]);
          parcelaAlvoId = created[0].id;
        }
      }

      await financeiroApi.parcelas.registrarPagamento(parcelaAlvoId);
      return { type, row, parcelaAlvoId };
    },
    onMutate: ({ type, row, parcelaId }) => {
      const aprovadasKey = ['servicos', 'solicitacoes', 'aprovadas', categoriaFiltro];
      const parcelasKey = ['servicos', 'parcelas', row.id];
      const previousAprovadas = queryClient.getQueryData(aprovadasKey);
      const previousParcelas = queryClient.getQueryData(parcelasKey);

      if (type === 'avista') {
        // Pagamento a vista quita a solicitacao inteira — some da fila de "Contas a pagar".
        queryClient.setQueryData(aprovadasKey, (old) => (old || []).filter((item) => item.id !== row.id));
      } else if (parcelaId) {
        // Pagamento de uma parcela especifica — so marca ela como paga; a solicitacao so sai da
        // fila quando TODAS as parcelas estiverem pagas (regra calculada no servidor), entao a
        // lista de "aprovadas" nao e tocada aqui.
        queryClient.setQueryData(parcelasKey, (old) =>
          (old || []).map((item) => (item.id === parcelaId ? { ...item, status: 'pago' } : item)),
        );
      }

      closePagamentoDialog();
      setSuccessOverlay(type === 'avista' ? 'Solicitacao marcada como paga' : 'Parcela paga');

      return { aprovadasKey, parcelasKey, previousAprovadas, previousParcelas };
    },
    onSuccess: ({ row, parcelaAlvoId }, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      queryClient.invalidateQueries({ queryKey: context.parcelasKey });
      uploadComprovantesEmBackground(row.id, parcelaAlvoId, variables.files);
    },
    onError: (error, variables, context) => {
      if (context?.previousAprovadas !== undefined) queryClient.setQueryData(context.aprovadasKey, context.previousAprovadas);
      if (context?.previousParcelas !== undefined) queryClient.setQueryData(context.parcelasKey, context.previousParcelas);
      setSuccessOverlay(null);
      setPagamentoTarget({ type: variables.type, row: variables.row, parcelaId: variables.parcelaId });
      setComprovantes(variables.files);
      toast({
        title: 'Não foi possível registrar o pagamento',
        description: `${getFriendlyErrorMessage(error)} Revise e tente novamente.`,
      });
    },
  });

  function handleConfirmarPagamento() {
    if (!pagamentoTarget) return;
    confirmarPagamentoMutation.mutate({ ...pagamentoTarget, files: comprovantes });
  }

  function closeReprovar() {
    setReprovarTarget(null);
    setMotivoReprovacao('');
  }

  const reprovarMutation = useMutation({
    mutationFn: ({ id, motivo }) => financeiroApi.solicitacoes.setStatus(id, 'reprovado', motivo),
    onMutate: ({ id }) => {
      const queryKey = ['servicos', 'solicitacoes', 'aprovadas', categoriaFiltro];
      const previous = queryClient.getQueryData(queryKey);
      const targetSnapshot = reprovarTarget;
      const motivoSnapshot = motivoReprovacao;
      queryClient.setQueryData(queryKey, (old) => (old || []).filter((row) => row.id !== id));
      closeReprovar();
      return { queryKey, previous, targetSnapshot, motivoSnapshot };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Solicitação reprovada', description: 'O solicitante foi notificado para corrigir e reenviar.' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      setReprovarTarget(context?.targetSnapshot ?? null);
      setMotivoReprovacao(context?.motivoSnapshot ?? '');
      toast({
        title: 'Não foi possível reprovar a solicitação',
        description: `${getFriendlyErrorMessage(error)} Revise e tente novamente.`,
      });
    },
  });

  function handleReprovar() {
    if (!reprovarTarget || !motivoReprovacao.trim()) return;
    reprovarMutation.mutate({ id: reprovarTarget.id, motivo: motivoReprovacao.trim() });
  }

  function closePendencia() {
    setPendenciaTarget(null);
    setMotivoPendencia('');
  }

  const sinalizarPendenciaMutation = useMutation({
    mutationFn: ({ id, motivo }) => financeiroApi.solicitacoes.marcarPendencia(id, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Pendência sinalizada', description: 'O solicitante foi notificado. O pagamento fica bloqueado até a liberação.' });
      closePendencia();
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível sinalizar a pendência',
        description: getFriendlyErrorMessage(error),
      });
    },
  });

  function handleSinalizarPendencia() {
    if (!pendenciaTarget || !motivoPendencia.trim()) return;
    sinalizarPendenciaMutation.mutate({ id: pendenciaTarget.id, motivo: motivoPendencia.trim() });
  }

  function closeLiberar() {
    setLiberarTarget(null);
  }

  const liberarPendenciaMutation = useMutation({
    mutationFn: (id) => financeiroApi.solicitacoes.liberarPendencia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Pendência liberada', description: 'A solicitação já pode ser paga normalmente.' });
      closeLiberar();
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível liberar a pendência',
        description: getFriendlyErrorMessage(error),
      });
    },
  });

  function handleLiberarPendencia() {
    if (!liberarTarget) return;
    liberarPendenciaMutation.mutate(liberarTarget.id);
  }

  function openParcelas(row) {
    setDialogRowId(row.id);
  }

  function closeDialog() {
    setDialogRowId(null);
    setDraftParcelas([]);
  }

  function addDraftParcela() {
    setDraftParcelas((current) => [...current, { valor: '', data_vencimento: '' }]);
  }

  function updateDraftParcela(index, field, value) {
    setDraftParcelas((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeDraftParcela(index) {
    setDraftParcelas((current) => current.filter((_, i) => i !== index));
  }

  const [cancelarParcelaTarget, setCancelarParcelaTarget] = useState(null);
  const [motivoCancelarParcela, setMotivoCancelarParcela] = useState('');

  const cancelarParcelaMutation = useMutation({
    mutationFn: ({ parcelaId, motivo }) => financeiroApi.parcelas.cancelar(parcelaId, motivo),
    onSuccess: (_row, { solicitacaoId }) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'parcelas', solicitacaoId] });
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Parcela cancelada' });
      setCancelarParcelaTarget(null);
      setMotivoCancelarParcela('');
    },
    onError: (error) => {
      toast({ title: 'Não foi possível cancelar a parcela', description: getFriendlyErrorMessage(error) });
    },
  });

  function handleCancelarParcela(solicitacaoId, parcela) {
    setCancelarParcelaTarget({ solicitacaoId, parcela });
    setMotivoCancelarParcela('');
  }

  function confirmarCancelarParcela() {
    if (!cancelarParcelaTarget) return;
    cancelarParcelaMutation.mutate({
      parcelaId: cancelarParcelaTarget.parcela.id,
      motivo: motivoCancelarParcela.trim() || null,
      solicitacaoId: cancelarParcelaTarget.solicitacaoId,
    });
  }

  const [reverterPagamentoTarget, setReverterPagamentoTarget] = useState(null);
  const [motivoReverterPagamento, setMotivoReverterPagamento] = useState('');

  const reverterPagamentoMutation = useMutation({
    mutationFn: ({ parcelaId, motivo }) => financeiroApi.parcelas.reverterPagamento(parcelaId, motivo),
    onSuccess: (_row, { solicitacaoId }) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'parcelas', solicitacaoId] });
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Pagamento revertido' });
      setReverterPagamentoTarget(null);
      setMotivoReverterPagamento('');
    },
    onError: (error) => {
      toast({ title: 'Não foi possível reverter o pagamento', description: getFriendlyErrorMessage(error) });
    },
  });

  function handleReverterPagamento(solicitacaoId, parcela) {
    setReverterPagamentoTarget({ solicitacaoId, parcela });
    setMotivoReverterPagamento('');
  }

  function confirmarReverterPagamento() {
    if (!reverterPagamentoTarget || !motivoReverterPagamento.trim()) return;
    reverterPagamentoMutation.mutate({
      parcelaId: reverterPagamentoTarget.parcela.id,
      motivo: motivoReverterPagamento.trim(),
      solicitacaoId: reverterPagamentoTarget.solicitacaoId,
    });
  }

  const criarParcelasMutation = useMutation({
    mutationFn: (parcelasPayload) => financeiroApi.parcelas.criar(dialogRowId, parcelasPayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'parcelas', dialogRowId] });
      setDraftParcelas([]);
      toast({ title: 'Plano de pagamento definido' });
    },
    onError: (error) => {
      toast({ title: 'Não foi possível salvar o plano de pagamento', description: getFriendlyErrorMessage(error) });
    },
  });

  function handleSalvarPlano() {
    if (!dialogRowId) return;
    criarParcelasMutation.mutate(
      draftParcelas.map((item) => ({ valor: Number(item.valor), data_vencimento: item.data_vencimento || null })),
    );
  }

  const activeFilterCount = [
    categoriaFiltro !== CATEGORIA_FILTRO_TODAS,
    classificacaoFiltro !== CLASSIFICACAO_TODAS,
    solicitanteFiltro !== SOLICITANTE_FILTRO_TODOS,
    empresaFiltro !== EMPRESA_FILTRO_TODAS,
    unidadeFiltro !== UNIDADE_FILTRO_TODAS,
    Boolean(vencimentoFiltro),
    fornecedorFiltro !== FORNECEDOR_FILTRO_TODOS,
    aprovadorFiltro !== APROVADOR_FILTRO_TODOS,
    formaPagamentoFiltro !== FORMA_PAGAMENTO_FILTRO_TODAS,
    Boolean(valorFiltro),
  ].filter(Boolean).length;

  function handleClearFiltros() {
    setCategoriaFiltro(CATEGORIA_FILTRO_TODAS);
    setClassificacaoFiltro(CLASSIFICACAO_TODAS);
    setSolicitanteFiltro(SOLICITANTE_FILTRO_TODOS);
    setEmpresaFiltro(EMPRESA_FILTRO_TODAS);
    setUnidadeFiltro(UNIDADE_FILTRO_TODAS);
    setVencimentoFiltro(null);
    setVencimentoResetToken((current) => current + 1);
    setFornecedorFiltro(FORNECEDOR_FILTRO_TODOS);
    setAprovadorFiltro(APROVADOR_FILTRO_TODOS);
    setFormaPagamentoFiltro(FORMA_PAGAMENTO_FILTRO_TODAS);
    setValorFiltro(null);
    setValorResetToken((current) => current + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Contas a pagar</h2>
        {!loading && visibleRows.length > 0 && (
          <div className="text-right text-sm">
            <p className="font-semibold">{formatValor(resumo.total)} a pagar</p>
            {resumo.atrasadas > 0 && (
              <p className="text-destructive">{resumo.atrasadas} atrasada{resumo.atrasadas > 1 ? 's' : ''}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 sm:w-64">
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar..."
          />
        </div>

        <div className="w-48 space-y-1">
          <Select value={vencimentoStatusFiltro} onValueChange={setVencimentoStatusFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={VENCIMENTO_STATUS_FILTRO_TODOS}>Todos vencimentos</SelectItem>
              {VENCIMENTO_STATUS_OPCOES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-48 space-y-1">
          <Select value={statusPagamentoFiltro} onValueChange={setStatusPagamentoFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_PAGAMENTO_FILTRO_OPCOES.map((opcao) => (
                <SelectItem key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Status de pagamento</span>
            <Select value={classificacaoFiltro} onValueChange={setClassificacaoFiltro}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLASSIFICACAO_TODAS}>Todas</SelectItem>
                <SelectItem value={CLASSIFICACAO_PARCIAL}>Pago parcial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={solicitanteFiltro} onValueChange={setSolicitanteFiltro}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SOLICITANTE_FILTRO_TODOS}>Todos os funcionários</SelectItem>
              {solicitantes.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação aguardando pagamento.</p>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Forma de pagamento</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Beneficiário</TableHead>
              <TableHead>Aprovador</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((row) => {
              const vencimentoInfo = getVencimentoInfo(row.vencimento_efetivo);
              const parcial = isParcialmentePago(row);
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                    isBloqueadaPorPendencia(row)
                      ? row.pendencia_atualizada_em
                        ? 'border-l-4 border-l-amber-500 bg-amber-500/5'
                        : 'border-l-4 border-l-destructive bg-destructive/5'
                      : ''
                  }`}
                  onClick={() => openParcelas(row)}
                  title="Ver parcelas e detalhes"
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {isBloqueadaPorPendencia(row) &&
                        (row.pendencia_atualizada_em ? (
                          <RefreshCw
                            className="h-4 w-4 shrink-0 text-amber-600"
                            aria-label={`Pendência corrigida em ${formatDataHora(row.pendencia_atualizada_em)}`}
                          />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Pendência" />
                        ))}
                      <span className="truncate" title={row.titulo || '-'}>
                        {truncarTitulo(row.titulo)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{row.solicitante_nome}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {parcial ? (
                        <Badge variant="secondary">Pago parcial</Badge>
                      ) : (
                        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] || row.status}</Badge>
                      )}
                      {row.eh_teste && (
                        <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
                          Teste
                        </Badge>
                      )}
                      {row.possui_nota_fiscal === true && Number(row.nota_fiscal_total || 0) === 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600"
                                >
                                  <FileWarning className="h-3 w-3" />
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Aguardando NF</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{formatDataVencimento(row.vencimento_efetivo)}</span>
                      {row.status !== 'pago' && (
                        <Badge variant={vencimentoInfo.variant}>{vencimentoInfo.label}</Badge>
                      )}
                    </div>
                  </TableCell>
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {row.status === 'aprovado' && (
                        <>
                          {user?.canReprovarAprovada && (
                            <Button
                              variant="destructive"
                              size="icon"
                              title="Reprovar"
                              aria-label="Reprovar"
                              onClick={(event) => { event.stopPropagation(); setReprovarTarget(row); }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {user?.isPagador && !isBloqueadaPorPendencia(row) && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Sinalizar pendência"
                              aria-label="Sinalizar pendência"
                              onClick={(event) => { event.stopPropagation(); setPendenciaTarget(row); }}
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                          )}
                          {isBloqueadaPorPendencia(row) ? (
                            user?.isPagador && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => { event.stopPropagation(); setLiberarTarget(row); }}
                              >
                                <Unlock className="mr-1 h-4 w-4" />
                                Liberar pendência
                              </Button>
                            )
                          ) : (
                            <Button
                              size="sm"
                              className="h-9 bg-emerald-600 text-white shadow hover:bg-emerald-600/90"
                              onClick={(event) => { event.stopPropagation(); openPagamentoAVista(row); }}
                            >
                              <Banknote className="mr-1 h-4 w-4" />
                              Pagar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {pageItems.map((row) => {
            const vencimentoInfo = getVencimentoInfo(row.vencimento_efetivo);
            const parcial = isParcialmentePago(row);
            return (
              <SolicitacaoCard
                key={row.id}
                row={row}
                onClick={() => openParcelas(row)}
                showSolicitante
                pendenciaMotivo={isBloqueadaPorPendencia(row) ? row.pendencia_motivo : null}
                pendenciaAtualizada={isBloqueadaPorPendencia(row) && Boolean(row.pendencia_atualizada_em)}
                badges={
                  <>
                    {parcial ? (
                      <Badge variant="secondary">Pago parcial</Badge>
                    ) : (
                      row.status !== 'aprovado' && (
                        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] || row.status}</Badge>
                      )
                    )}
                    {row.eh_teste && (
                      <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
                        Teste
                      </Badge>
                    )}
                    {row.possui_nota_fiscal === true && Number(row.nota_fiscal_total || 0) === 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600">
                                <FileWarning className="h-3 w-3" />
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Aguardando NF</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!row.aprovador_destino_nome && row.tipo_beneficiario === 'colaborador' && (
                      <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-sky-600">
                        Auto-aprovado
                      </Badge>
                    )}
                    {row.status !== 'pago' && (
                      <Badge variant={vencimentoInfo.variant}>{vencimentoInfo.label}</Badge>
                    )}
                  </>
                }
                actions={
                  row.status === 'aprovado' ? (
                    <>
                      {user?.canReprovarAprovada && (
                        <Button
                          variant="destructive"
                          size="icon"
                          title="Reprovar"
                          aria-label="Reprovar"
                          onClick={() => setReprovarTarget(row)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      {user?.isPagador && !isBloqueadaPorPendencia(row) && (
                        <Button
                          variant="outline"
                          size="icon"
                          title="Sinalizar pendência"
                          aria-label="Sinalizar pendência"
                          onClick={() => setPendenciaTarget(row)}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                      )}
                      {isBloqueadaPorPendencia(row) ? (
                        user?.isPagador && (
                          <Button size="sm" variant="outline" onClick={() => setLiberarTarget(row)}>
                            <Unlock className="mr-1 h-4 w-4" />
                            Liberar pendência
                          </Button>
                        )
                      ) : (
                        <Button
                          size="sm"
                          className="h-9 bg-emerald-600 text-white shadow hover:bg-emerald-600/90"
                          onClick={() => openPagamentoAVista(row)}
                        >
                          <Banknote className="mr-1 h-4 w-4" />
                          Pagar
                        </Button>
                      )}
                    </>
                  ) : null
                }
              />
            );
          })}
        </div>

        <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} itemLabel="solicitação(ões)" />
        </>
      )}

      <SolicitacaoDrawer
        solicitacao={dialogRow}
        onOpenChange={(open) => !open && closeDialog()}
        parcelasSlot={
          parcelasQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Carregando...
            </div>
          ) : parcelasQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Não foi possível carregar as parcelas desta solicitação.</p>
              <Button variant="outline" size="sm" onClick={() => parcelasQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : parcelas.length > 0 ? (
            <div className="space-y-2">
              {parcelas.map((parcela) => (
                <div key={parcela.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">Parcela {parcela.numero} — {formatValor(parcela.valor)}</p>
                    <p className="text-muted-foreground">Vencimento: {formatDataVencimento(parcela.data_vencimento)}</p>
                  </div>
                  {parcela.status === 'pago' ? (
                    <div className="flex items-center gap-2">
                      <Badge>Paga</Badge>
                      {user?.isFinanceiro && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReverterPagamento(dialogRow.id, parcela)}
                          disabled={reverterPagamentoMutation.isPending}
                        >
                          Reverter pagamento
                        </Button>
                      )}
                    </div>
                  ) : parcela.status === 'cancelado' ? (
                    <Badge variant="secondary">Cancelada</Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelarParcela(dialogRow.id, parcela)}
                        disabled={cancelarParcelaMutation.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => openPagamentoParcela(dialogRow, parcela.id)}>
                        Marcar como paga
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Quantidade de parcelas</span>
                <Select value={String(quantidadeParcelas)} onValueChange={handleQuantidadeParcelasChange}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((qtd) => (
                      <SelectItem key={qtd} value={String(qtd)}>
                        {qtd}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draftParcelas.map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <span className="text-xs text-muted-foreground">Valor (R$)</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.valor}
                      onChange={(event) => updateDraftParcela(index, 'valor', event.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-xs text-muted-foreground">Vencimento</span>
                    <Input
                      type="date"
                      value={item.data_vencimento}
                      onChange={(event) => updateDraftParcela(index, 'data_vencimento', event.target.value)}
                    />
                  </div>
                  {draftParcelas.length > 1 && (
                    <Button variant="outline" size="icon" onClick={() => removeDraftParcela(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addDraftParcela}>
                <Plus className="mr-1 h-4 w-4" />
                Adicionar parcela
              </Button>
              <Button
                className="w-full"
                onClick={handleSalvarPlano}
                disabled={criarParcelasMutation.isPending || draftParcelas.length === 0}
              >
                {criarParcelasMutation.isPending ? <Spinner size="sm" className="mr-2" /> : null}
                Salvar plano de pagamento
              </Button>
            </div>
          )
        }
      />

      <Dialog open={Boolean(reprovarTarget)} onOpenChange={(open) => !open && closeReprovar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar solicitação já aprovada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe o motivo. O solicitante poderá corrigir e reenviar a solicitação.
          </p>
          <Textarea
            value={motivoReprovacao}
            onChange={(event) => setMotivoReprovacao(event.target.value)}
            placeholder="Motivo da reprovação"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeReprovar} disabled={reprovarMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleReprovar}
              disabled={reprovarMutation.isPending || !motivoReprovacao.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {reprovarMutation.isPending ? 'Reprovando...' : 'Reprovar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendenciaTarget)} onOpenChange={(open) => !open && closePendencia()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sinalizar pendência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A solicitação continua aprovada, mas o pagamento fica bloqueado até a pendência ser
            liberada. O solicitante será notificado do motivo.
          </p>
          <Textarea
            value={motivoPendencia}
            onChange={(event) => setMotivoPendencia(event.target.value)}
            placeholder="Motivo da pendência"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={closePendencia} disabled={sinalizarPendenciaMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSinalizarPendencia}
              disabled={sinalizarPendenciaMutation.isPending || !motivoPendencia.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {sinalizarPendenciaMutation.isPending ? 'Sinalizando...' : 'Sinalizar pendência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(liberarTarget)} onOpenChange={(open) => !open && closeLiberar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar pendência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {liberarTarget?.pendencia_motivo && (
              <>Motivo registrado: "{liberarTarget.pendencia_motivo}". </>
            )}
            A solicitação volta a ficar disponível para pagamento.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={closeLiberar} disabled={liberarPendenciaMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleLiberarPendencia} disabled={liberarPendenciaMutation.isPending}>
              {liberarPendenciaMutation.isPending ? 'Liberando...' : 'Liberar pendência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pagamentoTarget)} onOpenChange={(open) => !open && closePagamentoDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Anexe o comprovante de pagamento (opcional, um ou mais arquivos, máx 5 MB cada).
          </p>
          <label
            htmlFor="comprovantes-pagamento"
            className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <Paperclip className="h-4 w-4" />
            Selecionar arquivo(s)
          </label>
          <input id="comprovantes-pagamento" type="file" multiple className="hidden" onChange={handleComprovanteChange} />
          {comprovantes.length > 0 && (
            <ul className="space-y-2">
              {comprovantes.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{file.name}</span>
                  <button type="button" onClick={() => removeComprovante(index)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePagamentoDialog} disabled={confirmarPagamentoMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarPagamento} disabled={confirmarPagamentoMutation.isPending}>
              {confirmarPagamentoMutation.isPending ? <Spinner size="sm" className="mr-2" /> : null}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentSuccessOverlay
        open={Boolean(successOverlay)}
        message={successOverlay}
        onOpenChange={(open) => !open && setSuccessOverlay(null)}
      />

      <ConfirmDeleteDialog
        open={Boolean(cancelarParcelaTarget)}
        onOpenChange={(open) => !open && setCancelarParcelaTarget(null)}
        onConfirm={confirmarCancelarParcela}
        isLoading={cancelarParcelaMutation.isPending}
        title="Cancelar parcela"
        description={
          cancelarParcelaTarget
            ? `A parcela ${cancelarParcelaTarget.parcela.numero} (${formatValor(cancelarParcelaTarget.parcela.valor)}) não será mais paga. Essa ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Cancelar parcela"
        loadingLabel="Cancelando..."
        cancelLabel="Voltar"
      >
        <Textarea
          placeholder="Motivo do cancelamento (opcional)"
          value={motivoCancelarParcela}
          onChange={(event) => setMotivoCancelarParcela(event.target.value)}
          rows={3}
        />
      </ConfirmDeleteDialog>

      <ConfirmDeleteDialog
        open={Boolean(reverterPagamentoTarget)}
        onOpenChange={(open) => !open && setReverterPagamentoTarget(null)}
        onConfirm={confirmarReverterPagamento}
        isLoading={reverterPagamentoMutation.isPending}
        title="Reverter pagamento"
        description={
          reverterPagamentoTarget
            ? `A parcela ${reverterPagamentoTarget.parcela.numero} (${formatValor(reverterPagamentoTarget.parcela.valor)}) voltará para pendente. Se essa era a última parcela paga, a solicitação também voltará para "aprovado".`
            : ''
        }
        confirmLabel="Reverter pagamento"
        loadingLabel="Revertendo..."
        cancelLabel="Voltar"
        confirmDisabled={!motivoReverterPagamento.trim()}
      >
        <Textarea
          placeholder="Motivo da reversão (obrigatório)"
          value={motivoReverterPagamento}
          onChange={(event) => setMotivoReverterPagamento(event.target.value)}
          rows={3}
        />
      </ConfirmDeleteDialog>
    </div>
  );
}
