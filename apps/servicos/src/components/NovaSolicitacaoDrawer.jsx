import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { useAuth } from '@/lib/AuthContext';
import { useCatalogosSolicitacao } from '@/hooks/useCatalogos';
import { isAllowedAnexoMimeType, MAX_ANEXO_SIZE, uploadAnexo } from '@/lib/anexoUpload';
import { getFriendlyErrorMessage } from '@/lib/errorMessage';
import { proximaDataUtil } from '@/lib/diasUteis';
import {
  TIPOS_ANEXO,
  FORMA_PAGAMENTO_LABEL,
  FORNECEDOR_FORM_VAZIO,
  formatCep,
  formatDocumento,
  formatTelefone,
  inferirTipoAnexo,
  onlyLetters,
} from '@/lib/financeiroFormat';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Textarea,
  useToast,
} from '@macom/ui';

const FORMAS_PAGAMENTO = Object.entries(FORMA_PAGAMENTO_LABEL).map(([value, label]) => ({ value, label }));

// Referencia estavel: um `[]` literal como default do useQuery criaria um array novo a cada
// render (a query fica desabilitada/sem dado ao criar uma solicitacao nova), o que reexecutava
// o useEffect que le esse valor em loop infinito ("Maximum update depth exceeded").
const EMPTY_PARCELAS = [];

const EMPTY_FORM = {
  titulo: '',
  tipoBeneficiario: 'fornecedor',
  fornecedorId: '',
  colaboradorBeneficiarioId: '',
  descricao: '',
  valor: '',
  categoriaId: '',
  dataVencimento: '',
  formaPagamento: '',
  observacao: '',
  empresaId: '',
  unidadeId: '',
  departamentoId: '',
  aprovadorDestinoId: '',
  ehTeste: false,
};

export default function NovaSolicitacaoDrawer({ open, onOpenChange, solicitacao = null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isReenvio = Boolean(solicitacao) && solicitacao.status === 'reprovado';
  const isEdicao =
    Boolean(solicitacao) && (solicitacao.status === 'pendente' || solicitacao.pendencia_bloqueio === true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [anexos, setAnexos] = useState([]);
  const [parcelado, setParcelado] = useState(false);
  const [draftParcelas, setDraftParcelas] = useState([]);
  const [visible, setVisible] = useState(open);
  const skipNextResetRef = useRef(false);
  const initialFormRef = useRef(EMPTY_FORM);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  const [novoFornecedorForm, setNovoFornecedorForm] = useState(FORNECEDOR_FORM_VAZIO);
  const [buscaFornecedor, setBuscaFornecedor] = useState('');

  useEffect(() => {
    setVisible(open);
  }, [open]);

  function uploadAnexosEmBackground(solicitacaoId, anexosParaEnviar) {
    if (anexosParaEnviar.length === 0) return;

    Promise.allSettled(
      anexosParaEnviar.map(({ file, tipoAnexo, sigiloso, assinaturasNecessarias }) =>
        uploadAnexo({ file, solicitacaoId, tipoAnexo, sigiloso, assinaturasNecessarias }),
      ),
    ).then((results) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'anexos', solicitacaoId] });
      const falhas = results.filter((result) => result.status === 'rejected');
      if (falhas.length > 0) {
        toast({
          title: falhas.length === 1 ? 'Um anexo não foi enviado' : `${falhas.length} anexos não foram enviados`,
          description: `A solicitação foi registrada normalmente, mas houve falha no envio: ${getFriendlyErrorMessage(falhas[0].reason)}. Você pode adicioná-los depois pela tela de detalhes.`,
        });
      }
    });
  }

  const minhasSolicitacoesKey = ['servicos', 'solicitacoes', 'minhas'];

  const submitMutation = useMutation({
    mutationFn: ({ payload }) => {
      if (isReenvio) return financeiroApi.solicitacoes.reenviar(solicitacao.id, payload);
      if (isEdicao) return financeiroApi.solicitacoes.update(solicitacao.id, payload);
      return financeiroApi.solicitacoes.create(payload);
    },
    onMutate: ({ payload, tempId }) => {
      const previous = queryClient.getQueryData(minhasSolicitacoesKey);
      const anexosSnapshot = anexos;
      const formSnapshot = form;
      const fornecedorNome =
        payload.tipo_beneficiario === 'colaborador'
          ? colaboradores.find((item) => item.id === payload.colaborador_beneficiario_id)?.nome || ''
          : fornecedores.find((item) => item.id === payload.fornecedor_id)?.nome || '';
      const isExistente = isReenvio || isEdicao;
      const optimisticId = isExistente ? solicitacao.id : tempId;
      const optimisticRow = {
        id: optimisticId,
        titulo: payload.titulo,
        fornecedor: fornecedorNome,
        descricao: payload.descricao,
        valor: payload.valor,
        status: 'pendente',
        criado_em: isExistente ? solicitacao.criado_em : new Date().toISOString(),
        solicitante_id: user?.collaborator?.id,
      };

      queryClient.setQueryData(minhasSolicitacoesKey, (old) => {
        const rows = old || [];
        if (isExistente) {
          return rows.map((row) => (row.id === solicitacao.id ? { ...row, ...optimisticRow } : row));
        }
        return [optimisticRow, ...rows];
      });

      // Fecha so localmente (sem tocar no estado do pai) pra poder reabrir
      // sozinho com o rascunho se o envio falhar — ver onError.
      setVisible(false);

      return { previous, tempId: optimisticId, anexosSnapshot, formSnapshot };
    },
    onSuccess: (row, _variables, context) => {
      queryClient.setQueryData(minhasSolicitacoesKey, (old) =>
        (old || []).map((existing) => (existing.id === context.tempId ? row : existing)),
      );
      toast(
        isReenvio
          ? { title: 'Solicitação reenviada', description: 'Sua solicitação voltou para a fila de aprovação.' }
          : isEdicao
            ? { title: 'Solicitação atualizada' }
            : { title: 'Solicitação enviada', description: 'Sua solicitação de pagamento foi registrada.' },
      );
      uploadAnexosEmBackground(row.id, context.anexosSnapshot);
      onOpenChange(false);
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(minhasSolicitacoesKey, context.previous);
      toast({
        title: isReenvio ? 'Não foi possível reenviar' : isEdicao ? 'Não foi possível salvar' : 'Não foi possível enviar',
        description: `${getFriendlyErrorMessage(error)} Revise os dados e tente novamente.`,
      });
      skipNextResetRef.current = true;
      setForm(context.formSnapshot);
      setAnexos(context.anexosSnapshot);
      setVisible(true);
    },
  });

  const {
    data: catalogos,
    isLoading: catalogosLoading,
  } = useCatalogosSolicitacao({ enabled: visible });
  const {
    empresas = [],
    unidades = [],
    departamentos = [],
    fornecedores = [],
    categorias = [],
    aprovadores = [],
    colaboradores = [],
  } = catalogos || {};

  const fornecedoresFiltrados = useMemo(() => {
    const termo = buscaFornecedor.trim().toLowerCase();
    if (!termo) return fornecedores;
    return fornecedores.filter((item) =>
      [item.nome, item.documento].filter(Boolean).some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [fornecedores, buscaFornecedor]);

  const unidadesDaEmpresa = form.empresaId
    ? unidades.filter((item) => item.empresa_id === form.empresaId)
    : unidades;

  const { data: parcelasExistentes = EMPTY_PARCELAS, isLoading: parcelasLoading } = useQuery({
    queryKey: ['servicos', 'parcelas', solicitacao?.id],
    queryFn: () => financeiroApi.parcelas.list(solicitacao.id),
    enabled: visible && (isEdicao || isReenvio) && Boolean(solicitacao?.id),
  });

  const { data: configuracaoModulo } = useQuery({
    queryKey: ['servicos', 'configuracao-modulo'],
    queryFn: () => financeiroApi.configuracaoModulo.get(),
    enabled: visible,
  });
  const aprovadorDispensado =
    form.tipoBeneficiario === 'colaborador' && Boolean(configuracaoModulo?.suprimento_caixa_sem_aprovador);

  // Lista configuravel de departamentos autorizados a abrir suprimento de caixa (ver
  // Configuracoes.jsx) -- vazia = sem restricao. So barra a criacao de solicitacao nova; se o
  // form ja estiver carregado com tipoBeneficiario 'colaborador' (edicao/reenvio de algo criado
  // antes da restricao existir ou por outro colaborador), nao esconde o campo.
  const departamentosPermitidosSuprimentoCaixa = configuracaoModulo?.suprimento_caixa_departamentos_permitidos || [];
  const podeAbrirSuprimentoCaixa =
    isReenvio ||
    isEdicao ||
    departamentosPermitidosSuprimentoCaixa.length === 0 ||
    departamentosPermitidosSuprimentoCaixa.includes(user?.collaborator?.departamento_id);

  useEffect(() => {
    if (!podeAbrirSuprimentoCaixa && form.tipoBeneficiario === 'colaborador') {
      handleTipoBeneficiarioChange('fornecedor');
    }
  }, [podeAbrirSuprimentoCaixa, form.tipoBeneficiario]);

  useEffect(() => {
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    // Selects de fornecedor/aprovador/categoria ficam montados (vazios, so disabled) antes do
    // catalogo carregar; preencher o valor antes disso faz o Radix Select ressincronizar com o
    // <select> nativo interno (sem <option> correspondente ainda) e zerar o campo sozinho.
    if (visible && (isReenvio || isEdicao) && (catalogosLoading || parcelasLoading)) return;
    if (visible && (isReenvio || isEdicao)) {
      const loadedForm = {
        titulo: solicitacao.titulo || '',
        tipoBeneficiario: solicitacao.tipo_beneficiario || 'fornecedor',
        fornecedorId: solicitacao.fornecedor_id || '',
        colaboradorBeneficiarioId: solicitacao.colaborador_beneficiario_id || '',
        descricao: solicitacao.descricao || '',
        valor: solicitacao.valor != null ? String(solicitacao.valor) : '',
        categoriaId: solicitacao.categoria_id || '',
        dataVencimento: solicitacao.data_vencimento ? solicitacao.data_vencimento.slice(0, 10) : '',
        formaPagamento: solicitacao.forma_pagamento || '',
        observacao: solicitacao.observacao || '',
        empresaId: solicitacao.empresa_id || '',
        unidadeId: solicitacao.unidade_id || '',
        departamentoId: solicitacao.departamento_id || '',
        aprovadorDestinoId: solicitacao.aprovador_destino_id || '',
      };
      setForm(loadedForm);
      initialFormRef.current = loadedForm;
      if (parcelasExistentes.length > 0) {
        setParcelado(true);
        setDraftParcelas(
          parcelasExistentes.map((parcela) => ({
            valor: String(parcela.valor),
            data_vencimento: parcela.data_vencimento ? parcela.data_vencimento.slice(0, 10) : '',
          })),
        );
      } else {
        setParcelado(false);
        setDraftParcelas([]);
      }
    } else if (visible) {
      setForm((current) => {
        const loadedForm = {
          ...current,
          empresaId: user?.collaborator?.empresa_id || '',
          unidadeId: user?.collaborator?.unidade_id || '',
          departamentoId: user?.collaborator?.departamento_id || '',
        };
        initialFormRef.current = loadedForm;
        return loadedForm;
      });
    } else {
      setForm(EMPTY_FORM);
      setAnexos([]);
      setParcelado(false);
      setDraftParcelas([]);
      initialFormRef.current = EMPTY_FORM;
    }
  }, [visible, catalogosLoading, parcelasLoading, parcelasExistentes]);

  function handleToggleParcelado(checked) {
    const nextChecked = checked === true;
    setParcelado(nextChecked);
    if (nextChecked) {
      setDraftParcelas([{ valor: form.valor, data_vencimento: form.dataVencimento }]);
    } else {
      setDraftParcelas([]);
    }
  }

  function addDraftParcela() {
    setDraftParcelas((current) => [...current, { valor: '', data_vencimento: '' }]);
  }

  function avisarAjusteDiaUtil(dataAjustada) {
    toast({
      title: 'Vencimento ajustado',
      description: `Sábados, domingos e feriados não são permitidos. Data ajustada para ${dataAjustada.split('-').reverse().join('/')}.`,
    });
  }

  function handleDataVencimentoChange(value) {
    if (!value) {
      setField('dataVencimento')(value);
      return;
    }
    const ajustada = proximaDataUtil(value);
    if (ajustada !== value) avisarAjusteDiaUtil(ajustada);
    setField('dataVencimento')(ajustada);
  }

  function updateDraftParcela(index, field, value) {
    if (field === 'data_vencimento' && value) {
      const ajustada = proximaDataUtil(value);
      if (ajustada !== value) avisarAjusteDiaUtil(ajustada);
      setDraftParcelas((current) => current.map((item, i) => (i === index ? { ...item, data_vencimento: ajustada } : item)));
      return;
    }
    setDraftParcelas((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeDraftParcela(index) {
    setDraftParcelas((current) => current.filter((_, i) => i !== index));
  }

  const criarFornecedorMutation = useMutation({
    mutationFn: (dados) => financeiroApi.fornecedores.criar(dados),
    onSuccess: (row) => {
      if (!row) return;
      queryClient.invalidateQueries({ queryKey: ['servicos', 'catalogos-solicitacao'] });
      setForm((current) => ({ ...current, fornecedorId: row.id }));
      setNovoFornecedorOpen(false);
      setNovoFornecedorForm(FORNECEDOR_FORM_VAZIO);
      toast({ title: 'Fornecedor cadastrado' });
    },
    onError: (error) => {
      toast({ title: 'Não foi possível cadastrar o fornecedor', description: getFriendlyErrorMessage(error) });
    },
  });

  function updateNovoFornecedorForm(field, value) {
    setNovoFornecedorForm((current) => ({ ...current, [field]: value }));
  }

  function handleCriarFornecedor(event) {
    event.preventDefault();
    const nome = novoFornecedorForm.nome.trim();
    if (!nome) return;
    criarFornecedorMutation.mutate({ ...novoFornecedorForm, nome });
  }

  const setField = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  function handleTipoBeneficiarioChange(value) {
    setForm((current) => ({
      ...current,
      tipoBeneficiario: value,
      fornecedorId: value === 'fornecedor' ? current.fornecedorId : '',
      colaboradorBeneficiarioId: value === 'colaborador' ? current.colaboradorBeneficiarioId : '',
    }));
  }

  function handleEmpresaChange(value) {
    setForm((current) => {
      const unidadeAindaValida = unidades.some(
        (item) => item.id === current.unidadeId && item.empresa_id === value,
      );
      return { ...current, empresaId: value, unidadeId: unidadeAindaValida ? current.unidadeId : '' };
    });
  }

  const hasUnsavedChanges = () =>
    anexos.length > 0 || JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && hasUnsavedChanges()) {
      const confirmed = window.confirm('Existem dados preenchidos que serão perdidos. Deseja mesmo fechar?');
      if (!confirmed) return;
    }
    setVisible(nextOpen);
    onOpenChange(nextOpen);
  };

  const handleFileChange = (event) => {
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
    setAnexos((current) => [
      ...current,
      ...files.map((file) => ({
        file,
        tipoAnexo: inferirTipoAnexo(file.name) || '',
        sigiloso: false,
        assinaturasNecessarias: 1,
      })),
    ]);
    event.target.value = '';
  };

  const removeAnexo = (index) => {
    setAnexos((current) => current.filter((_, i) => i !== index));
  };

  const setAnexoTipo = (index) => (value) => {
    setAnexos((current) => current.map((item, i) => (i === index ? { ...item, tipoAnexo: value } : item)));
  };

  const setAnexoSigiloso = (index) => (checked) => {
    setAnexos((current) => current.map((item, i) => (i === index ? { ...item, sigiloso: checked === true } : item)));
  };

  const setAnexoAssinaturasNecessarias = (index) => (checked) => {
    setAnexos((current) =>
      current.map((item, i) => (i === index ? { ...item, assinaturasNecessarias: checked === true ? 2 : 1 } : item)),
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitMutation.isPending) return;

    const beneficiarioFaltando = form.tipoBeneficiario === 'fornecedor' && !form.fornecedorId;

    if (!isEdicao && !isReenvio && anexos.length === 0) {
      toast({ title: 'Anexo obrigatório', description: 'Selecione ao menos um arquivo antes de enviar a solicitação.' });
      return;
    }

    if (anexos.some((item) => !item.tipoAnexo)) {
      toast({ title: 'Classifique os anexos', description: 'Selecione o tipo de cada anexo antes de enviar.' });
      return;
    }

    if (
      beneficiarioFaltando ||
      (!aprovadorDispensado && !form.aprovadorDestinoId) ||
      !form.categoriaId ||
      !form.formaPagamento ||
      (empresas.length > 0 && !form.empresaId)
    ) {
      toast({
        title: 'Campos obrigatórios faltando',
        description:
          form.tipoBeneficiario === 'colaborador'
            ? 'Selecione empresa, aprovador, categoria e forma de pagamento antes de enviar.'
            : 'Selecione empresa, fornecedor, aprovador, categoria e forma de pagamento antes de enviar.',
      });
      return;
    }

    let parcelasPayload;
    if (parcelado) {
      const soma = draftParcelas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
      if (draftParcelas.some((item) => !Number(item.valor) || Number(item.valor) <= 0)) {
        toast({ title: 'Parcelas inválidas', description: 'Informe um valor maior que zero em cada parcela.' });
        return;
      }
      if (Math.abs(soma - Number(form.valor)) >= 0.01) {
        toast({
          title: 'Soma das parcelas incorreta',
          description: `A soma das parcelas (${soma.toFixed(2)}) precisa ser igual ao valor total (${Number(form.valor || 0).toFixed(2)}).`,
        });
        return;
      }
      parcelasPayload = draftParcelas.map((item) => ({ valor: Number(item.valor), data_vencimento: item.data_vencimento || null }));
    } else if ((isEdicao || isReenvio) && parcelasExistentes.length > 0) {
      // Tinha parcelamento e o usuario desmarcou: manda vazio explicito pra API apagar o
      // plano existente (volta a ser "a vista") -- ver substituirPlanoParcelas.
      parcelasPayload = [];
    }

    submitMutation.mutate({
      tempId: `optimistic-${crypto.randomUUID()}`,
      payload: {
        titulo: form.titulo,
        tipo_beneficiario: form.tipoBeneficiario,
        fornecedor_id: form.tipoBeneficiario === 'fornecedor' ? form.fornecedorId : null,
        colaborador_beneficiario_id: form.tipoBeneficiario === 'colaborador' ? form.colaboradorBeneficiarioId : null,
        descricao: form.descricao,
        valor: Number(form.valor),
        categoria_id: form.categoriaId,
        data_vencimento: form.dataVencimento || null,
        forma_pagamento: form.formaPagamento,
        observacao: form.observacao || null,
        empresa_id: form.empresaId || null,
        unidade_id: form.unidadeId || null,
        departamento_id: form.departamentoId || null,
        aprovador_destino_id: aprovadorDispensado ? null : form.aprovadorDestinoId,
        ...(parcelasPayload ? { parcelas: parcelasPayload } : {}),
        ...(!isEdicao && !isReenvio && user?.system_access_level === 'admin' && form.ehTeste
          ? { eh_teste: true }
          : {}),
      },
    });
  };

  return (
    <Sheet open={visible} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>
            {isReenvio ? 'Corrigir e reenviar solicitação' : isEdicao ? 'Editar solicitação' : 'Nova solicitação de pagamento'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              id="titulo"
              value={form.titulo}
              onChange={(event) => setField('titulo')(event.target.value)}
              placeholder="Título curto da solicitação"
              required
            />
          </div>

          {podeAbrirSuprimentoCaixa && (
            <div className="space-y-2">
              <Label>Tipo de solicitação</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.tipoBeneficiario === 'fornecedor' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => handleTipoBeneficiarioChange('fornecedor')}
                >
                  Fornecedor
                </Button>
                <Button
                  type="button"
                  variant={form.tipoBeneficiario === 'colaborador' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => handleTipoBeneficiarioChange('colaborador')}
                >
                  Suprimento de caixa
                </Button>
              </div>
            </div>
          )}

          {form.tipoBeneficiario === 'colaborador' ? (
            <div className="space-y-2">
              <Label htmlFor="colaboradorBeneficiario">Colaborador</Label>
              <Select
                value={form.colaboradorBeneficiarioId}
                onValueChange={setField('colaboradorBeneficiarioId')}
                disabled={catalogosLoading}
              >
                <SelectTrigger id="colaboradorBeneficiario">
                  <SelectValue placeholder={catalogosLoading ? 'Carregando...' : 'Selecione o colaborador (opcional)'} />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fornecedor">
                Fornecedor <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={form.fornecedorId}
                  onValueChange={setField('fornecedorId')}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen) setBuscaFornecedor('');
                  }}
                  disabled={catalogosLoading}
                >
                  <SelectTrigger id="fornecedor" className="flex-1">
                    <SelectValue placeholder={catalogosLoading ? 'Carregando...' : 'Selecione o fornecedor'} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-popover p-1 pb-1.5">
                      <Input
                        autoFocus
                        placeholder="Buscar fornecedor..."
                        value={buscaFornecedor}
                        onChange={(event) => setBuscaFornecedor(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="h-8"
                      />
                    </div>
                    {fornecedoresFiltrados.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum fornecedor encontrado</div>
                    ) : (
                      fornecedoresFiltrados.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.nome}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Cadastrar novo fornecedor"
                  onClick={() => setNovoFornecedorOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {aprovadorDispensado ? (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              Suprimento de caixa não exige aprovador — a solicitação é aprovada e paga
              diretamente pelo financeiro (Gerente).
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="aprovadorDestino">
                Aprovador responsável <span className="text-destructive">*</span>
              </Label>
              <Select value={form.aprovadorDestinoId} onValueChange={setField('aprovadorDestinoId')} disabled={catalogosLoading}>
                <SelectTrigger id="aprovadorDestino">
                  <SelectValue placeholder={catalogosLoading ? 'Carregando...' : 'Selecione quem vai aprovar'} />
                </SelectTrigger>
                <SelectContent>
                  {aprovadores.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descricao">
              Descrição <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="descricao"
              value={form.descricao}
              onChange={(event) => setField('descricao')(event.target.value)}
              placeholder="O que está sendo pago"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor">
                Valor (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="valor"
                type="number"
                min="0.01"
                step="0.01"
                value={form.valor}
                onChange={(event) => setField('valor')(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">
                Categoria <span className="text-destructive">*</span>
              </Label>
              <Select value={form.categoriaId} onValueChange={setField('categoriaId')} disabled={catalogosLoading}>
                <SelectTrigger id="categoria">
                  <SelectValue placeholder={catalogosLoading ? 'Carregando...' : 'Selecione a categoria'} />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <label htmlFor="parcelado" className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox id="parcelado" checked={parcelado} onCheckedChange={handleToggleParcelado} />
              Parcelar pagamento
            </label>
            {parcelado && (
                <div className="space-y-3">
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
                        <Button type="button" variant="outline" size="icon" onClick={() => removeDraftParcela(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addDraftParcela}>
                    <Plus className="mr-1 h-4 w-4" />
                    Adicionar parcela
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    A soma das parcelas precisa ser igual ao valor total da solicitação. O plano fica sujeito a
                    revisão do financeiro/contas a pagar depois de aprovado.
                </p>
              </div>
            )}
          </div>

          <div className={parcelado ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-4'}>
            {!parcelado && (
              <div className="space-y-2">
                <Label htmlFor="dataVencimento">Data de vencimento</Label>
                <Input
                  id="dataVencimento"
                  type="date"
                  value={form.dataVencimento}
                  onChange={(event) => handleDataVencimentoChange(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="formaPagamento">
                Forma de pagamento <span className="text-destructive">*</span>
              </Label>
              <Select value={form.formaPagamento} onValueChange={setField('formaPagamento')}>
                <SelectTrigger id="formaPagamento">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {empresas.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="empresa">
                Empresa <span className="text-destructive">*</span>
              </Label>
              <Select value={form.empresaId} onValueChange={handleEmpresaChange}>
                <SelectTrigger id="empresa">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {unidades.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade</Label>
              <Select value={form.unidadeId} onValueChange={setField('unidadeId')}>
                <SelectTrigger id="unidade">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {unidadesDaEmpresa.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {departamentos.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="departamento">Setor</Label>
              <Select value={form.departamentoId} onValueChange={setField('departamentoId')}>
                <SelectTrigger id="departamento">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {departamentos.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="observacao">Observação (opcional)</Label>
            <Textarea
              id="observacao"
              value={form.observacao}
              onChange={(event) => setField('observacao')(event.target.value)}
              placeholder="Notas adicionais para quem for analisar"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="anexos">
              Anexos {!isEdicao && !isReenvio ? '(obrigatório, máx 5 MB cada)' : '(máx 5 MB cada)'}
            </Label>
            <label
              htmlFor="anexos"
              className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:bg-accent"
            >
              <Paperclip className="h-4 w-4" />
              Selecionar arquivo(s)
            </label>
            <input id="anexos" type="file" multiple className="hidden" onChange={handleFileChange} />
            {anexos.length > 0 && (
              <ul className="space-y-2">
                {anexos.map(({ file, tipoAnexo, sigiloso, assinaturasNecessarias }, index) => (
                  <li key={`${file.name}-${index}`} className="space-y-2 rounded-md bg-muted px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">{file.name}</span>
                      <button type="button" onClick={() => removeAnexo(index)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={tipoAnexo} onValueChange={setAnexoTipo(index)}>
                        <SelectTrigger className="h-8 w-48">
                          <SelectValue placeholder="Tipo de anexo" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_ANEXO.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <label htmlFor={`anexo-sigiloso-${index}`} className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          id={`anexo-sigiloso-${index}`}
                          checked={sigiloso}
                          onCheckedChange={setAnexoSigiloso(index)}
                        />
                        Documento sigiloso
                      </label>
                      <label
                        htmlFor={`anexo-duas-assinaturas-${index}`}
                        className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Checkbox
                          id={`anexo-duas-assinaturas-${index}`}
                          checked={assinaturasNecessarias === 2}
                          onCheckedChange={setAnexoAssinaturasNecessarias(index)}
                        />
                        Exigir assinatura dos dois responsáveis
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isEdicao && !isReenvio && user?.system_access_level === 'admin' && (
            <label
              htmlFor="ehTeste"
              className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground"
            >
              <Checkbox
                id="ehTeste"
                checked={form.ehTeste}
                onCheckedChange={(checked) => setField('ehTeste')(checked === true)}
              />
              Marcar como solicitação de teste (pode ser excluída depois)
            </label>
          )}

          <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {isReenvio ? 'Reenviando...' : isEdicao ? 'Salvando...' : 'Enviando...'}
              </>
            ) : isReenvio ? (
              'Reenviar solicitação'
            ) : isEdicao ? (
              'Salvar alterações'
            ) : (
              'Enviar solicitação'
            )}
          </Button>
        </form>
      </SheetContent>

      <Dialog
        open={novoFornecedorOpen}
        onOpenChange={(nextOpen) => {
          setNovoFornecedorOpen(nextOpen);
          if (!nextOpen) setNovoFornecedorForm(FORNECEDOR_FORM_VAZIO);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Cadastrar novo fornecedor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCriarFornecedor} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="novoFornecedorNome">Nome *</Label>
                <Input
                  id="novoFornecedorNome"
                  maxLength={120}
                  value={novoFornecedorForm.nome}
                  onChange={(event) => updateNovoFornecedorForm('nome', event.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="novoFornecedorTipoPessoa">Tipo de pessoa</Label>
                <select
                  id="novoFornecedorTipoPessoa"
                  value={novoFornecedorForm.tipo_pessoa}
                  onChange={(event) => updateNovoFornecedorForm('tipo_pessoa', event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Não informado</option>
                  <option value="fisica">Pessoa física</option>
                  <option value="juridica">Pessoa jurídica</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="novoFornecedorDocumento">CPF/CNPJ</Label>
                <Input
                  id="novoFornecedorDocumento"
                  inputMode="numeric"
                  value={novoFornecedorForm.documento}
                  onChange={(event) => updateNovoFornecedorForm('documento', formatDocumento(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novoFornecedorInscricaoEstadual">Inscrição estadual</Label>
                <Input
                  id="novoFornecedorInscricaoEstadual"
                  maxLength={20}
                  value={novoFornecedorForm.inscricao_estadual}
                  onChange={(event) => updateNovoFornecedorForm('inscricao_estadual', event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novoFornecedorEmail">E-mail</Label>
                <Input
                  id="novoFornecedorEmail"
                  type="email"
                  value={novoFornecedorForm.email}
                  onChange={(event) => updateNovoFornecedorForm('email', event.target.value.trim().toLowerCase())}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novoFornecedorTelefone">Telefone</Label>
                <Input
                  id="novoFornecedorTelefone"
                  inputMode="numeric"
                  value={novoFornecedorForm.telefone}
                  onChange={(event) => updateNovoFornecedorForm('telefone', formatTelefone(event.target.value))}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="novoFornecedorEndereco">Endereço</Label>
                <Input
                  id="novoFornecedorEndereco"
                  maxLength={150}
                  value={novoFornecedorForm.endereco}
                  onChange={(event) => updateNovoFornecedorForm('endereco', event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novoFornecedorCidade">Cidade</Label>
                <Input
                  id="novoFornecedorCidade"
                  maxLength={80}
                  value={novoFornecedorForm.cidade}
                  onChange={(event) => updateNovoFornecedorForm('cidade', event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="novoFornecedorUf">UF</Label>
                  <Input
                    id="novoFornecedorUf"
                    maxLength={2}
                    value={novoFornecedorForm.uf}
                    onChange={(event) => updateNovoFornecedorForm('uf', onlyLetters(event.target.value).toUpperCase())}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="novoFornecedorCep">CEP</Label>
                  <Input
                    id="novoFornecedorCep"
                    inputMode="numeric"
                    value={novoFornecedorForm.cep}
                    onChange={(event) => updateNovoFornecedorForm('cep', formatCep(event.target.value))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setNovoFornecedorOpen(false); setNovoFornecedorForm(FORNECEDOR_FORM_VAZIO); }}
                disabled={criarFornecedorMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={criarFornecedorMutation.isPending || !novoFornecedorForm.nome.trim()}>
                {criarFornecedorMutation.isPending ? <Spinner size="sm" className="mr-2" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
