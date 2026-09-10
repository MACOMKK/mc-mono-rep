import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { companyFromUnit } from '@/lib/empresa';
import { deriveUnidadesFromResponsaveis } from '@/hooks/useUnidadesEmpresa';
import { crmDataClient } from '@/api/crmDataClient';
import {
  BriefcaseBusiness,
  Car,
  ExternalLink,
  FileText,
  Paperclip,
  Store,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatBytes(value = 0) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function LeadForm({
  open,
  onOpenChange,
  lead,
  responsaveis = [],
  notes = [],
  attachments = [],
  onSave,
  onAddNote,
  onAddAttachment,
  onOpenAttachment,
  onDeleteAttachment,
  addingNote = false,
  uploadingAttachment = false,
  deletingAttachment = false,
}) {
  const [data, setData] = useState(lead || {
    nome: '',
    telefone: '',
    email: '',
    origem_id: '',
    status: 'novo',
    modelo_interesse: '',
    veiculo_interesse: {
      marca: '',
      modelo: '',
      marca_id: null,
      modelo_id: null,
      marca_outro: '',
      modelo_outro: '',
      versao: '',
      ano: '',
      categoria_veiculo_id: null,
      condicao: 'novo',
      faixa_preco_min: '',
      faixa_preco_max: '',
      cor_preferida: '',
      combustivel: '',
      cambio: '',
      atributos: {},
      observacoes: '',
    },
    empresa: 'Macom Ananindeua',
    responsavel_id: '',
    previsao_fechamento: '',
    motivo_perda: '',
    observacoes: '',
  });
  const [noteText, setNoteText] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [unidadeError, setUnidadeError] = useState('');
  const [telefoneError, setTelefoneError] = useState('');
  const [showMaisDetalhesVeiculo, setShowMaisDetalhesVeiculo] = useState(false);
  const set = (field, value) => setData((current) => ({ ...current, [field]: value }));
  const setVehicle = (field, value) => setData((current) => ({
    ...current,
    veiculo_interesse: {
      ...(current.veiculo_interesse || {}),
      [field]: value,
    },
  }));

  const steps = useMemo(() => [
    { key: 'contato', label: 'Contato', icon: UserRound },
    { key: 'veiculo', label: 'Veiculo', icon: Car },
    { key: 'comercial', label: 'Comercial', icon: BriefcaseBusiness },
    { key: 'responsavel', label: 'Responsavel', icon: Store },
    { key: 'observacoes', label: 'Observacoes', icon: FileText },
    ...(lead ? [{ key: 'historico', label: 'Historico', icon: Paperclip }] : []),
  ], [lead]);

  const unidades = useMemo(() => deriveUnidadesFromResponsaveis(responsaveis), [responsaveis]);

  const { data: categoriasVeiculo = [] } = useQuery({
    queryKey: ['crm-categorias-veiculo'],
    queryFn: () => crmDataClient.entities.CategoriaVeiculo.list('nome'),
    enabled: open,
  });
  const categoriasSelecionaveis = useMemo(
    () => categoriasVeiculo.filter(
      (categoria) => categoria.ativo || categoria.id === data.veiculo_interesse?.categoria_veiculo_id,
    ),
    [categoriasVeiculo, data.veiculo_interesse?.categoria_veiculo_id],
  );
  const categoriaSelecionada = useMemo(
    () => categoriasVeiculo.find((categoria) => categoria.id === data.veiculo_interesse?.categoria_veiculo_id) || null,
    [categoriasVeiculo, data.veiculo_interesse?.categoria_veiculo_id],
  );
  const camposExtraSegmento = categoriaSelecionada?.campos_extra || [];

  const { data: marcasVeiculo = [] } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
    enabled: open,
  });

  const { data: modelosVeiculo = [] } = useQuery({
    queryKey: ['crm-modelos-veiculo'],
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
    enabled: open,
  });

  const marcasIdsComModeloNoSegmento = useMemo(() => {
    const categoriaId = data.veiculo_interesse?.categoria_veiculo_id;
    if (!categoriaId) return null;
    return new Set(
      modelosVeiculo
        .filter((modelo) => modelo.categoria_veiculo_id === categoriaId)
        .map((modelo) => modelo.marca_id),
    );
  }, [modelosVeiculo, data.veiculo_interesse?.categoria_veiculo_id]);

  const marcasSelecionaveis = useMemo(
    () => marcasVeiculo.filter((marca) => (
      (marca.ativo || marca.id === data.veiculo_interesse?.marca_id)
      && (!marcasIdsComModeloNoSegmento || marcasIdsComModeloNoSegmento.has(marca.id) || marca.id === data.veiculo_interesse?.marca_id)
    )),
    [marcasVeiculo, marcasIdsComModeloNoSegmento, data.veiculo_interesse?.marca_id],
  );

  const modelosSelecionaveis = useMemo(
    () => modelosVeiculo.filter((modelo) => (
      modelo.marca_id === data.veiculo_interesse?.marca_id
      && modelo.categoria_veiculo_id === data.veiculo_interesse?.categoria_veiculo_id
      && (modelo.ativo || modelo.id === data.veiculo_interesse?.modelo_id)
    )),
    [modelosVeiculo, data.veiculo_interesse?.marca_id, data.veiculo_interesse?.categoria_veiculo_id, data.veiculo_interesse?.modelo_id],
  );

  const setMarca = (value) => {
    if (value === 'outra') {
      setData((current) => ({
        ...current,
        veiculo_interesse: {
          ...(current.veiculo_interesse || {}),
          marca_id: null,
          marca: current.veiculo_interesse?.marca_outro || '',
          modelo_id: null,
        },
      }));
      return;
    }
    const marca = marcasVeiculo.find((item) => item.id === value);
    setData((current) => ({
      ...current,
      veiculo_interesse: {
        ...(current.veiculo_interesse || {}),
        marca_id: value,
        marca_outro: '',
        marca: marca?.nome || '',
        modelo_id: null,
      },
    }));
  };

  const setMarcaOutro = (texto) => {
    setData((current) => ({
      ...current,
      veiculo_interesse: {
        ...(current.veiculo_interesse || {}),
        marca_outro: texto,
        marca: texto,
      },
    }));
  };

  const setModelo = (value) => {
    if (value === 'outro') {
      setData((current) => ({
        ...current,
        veiculo_interesse: {
          ...(current.veiculo_interesse || {}),
          modelo_id: null,
          modelo: current.veiculo_interesse?.modelo_outro || '',
        },
      }));
      return;
    }
    const modelo = modelosVeiculo.find((item) => item.id === value);
    setData((current) => ({
      ...current,
      veiculo_interesse: {
        ...(current.veiculo_interesse || {}),
        modelo_id: value,
        modelo_outro: '',
        modelo: modelo?.nome || '',
      },
    }));
    set('modelo_interesse', modelo?.nome || '');
  };

  const setModeloOutro = (texto) => {
    setData((current) => ({
      ...current,
      veiculo_interesse: {
        ...(current.veiculo_interesse || {}),
        modelo_outro: texto,
        modelo: texto,
      },
    }));
    set('modelo_interesse', texto);
  };

  const setAtributo = (chave, value) => {
    setData((current) => ({
      ...current,
      veiculo_interesse: {
        ...(current.veiculo_interesse || {}),
        atributos: {
          ...(current.veiculo_interesse?.atributos || {}),
          [chave]: value,
        },
      },
    }));
  };

  const { data: origensLead = [] } = useQuery({
    queryKey: ['crm-origens-lead'],
    queryFn: () => crmDataClient.entities.OrigemLead.list('nome'),
    enabled: open,
  });
  const origensSelecionaveis = useMemo(
    () => origensLead.filter((origem) => origem.ativo || origem.id === data.origem_id),
    [origensLead, data.origem_id],
  );

  const currentStepKey = steps[currentStep]?.key;
  const isLastStep = currentStep === steps.length - 1;
  const responsaveisDaUnidade = responsaveis.filter((item) => !data.unidade_id || item.unidade_id === data.unidade_id);

  useEffect(() => {
    if (data.unidade_id || unidades.length === 0) return;
    const expectedCompany = data.empresa || 'Macom Ananindeua';
    const matched = unidades.find((item) => companyFromUnit(item.nome) === expectedCompany) || unidades[0];
    setData((current) => ({ ...current, unidade_id: matched.id, empresa: companyFromUnit(matched.nome) }));
  }, [data.empresa, data.unidade_id, unidades]);

  useEffect(() => {
    if (data.origem_id || origensLead.length === 0) return;
    const matched = origensLead.find((item) => item.nome.toLowerCase() === 'site') || origensLead[0];
    setData((current) => ({ ...current, origem_id: matched.id }));
  }, [data.origem_id, origensLead]);

  useEffect(() => {
    setCurrentStep(0);
  }, [lead?.id, open]);

  const setUnidade = (unidadeId) => {
    const unidade = unidades.find((item) => item.id === unidadeId);
    setData((current) => ({
      ...current,
      unidade_id: unidadeId,
      empresa: companyFromUnit(unidade?.nome),
      responsavel_id: responsaveis.some((item) => item.id === current.responsavel_id && item.unidade_id === unidadeId)
        ? current.responsavel_id
        : '',
    }));
    setUnidadeError('');
  };

  const saveNote = () => {
    const text = noteText.trim();
    if (!text || !onAddNote) return;
    onAddNote(text);
    setNoteText('');
  };

  const addAttachment = (event) => {
    const file = event.target.files?.[0];
    if (file && onAddAttachment) {
      onAddAttachment(file);
    }
    event.target.value = '';
  };

  const goNext = () => setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  const goBack = () => setCurrentStep((step) => Math.max(step - 1, 0));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!data.telefone) {
      setTelefoneError('Informe o telefone antes de salvar.');
      setCurrentStep(steps.findIndex((step) => step.key === 'contato'));
      return;
    }
    setTelefoneError('');
    if (!data.unidade_id) {
      setUnidadeError('Selecione uma unidade antes de salvar.');
      setCurrentStep(steps.findIndex((step) => step.key === 'responsavel'));
      return;
    }
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 rounded-none p-0">
        <DialogHeader className="bg-[#1a1a1a] px-6 py-4">
          <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
            {lead ? 'Editar Lead' : 'Novo Lead'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para {lead ? 'editar os dados do' : 'cadastrar um novo'} lead, organizado em etapas de contato, veiculo, dados comerciais, responsavel e observacoes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-white px-6 py-4">
            <div className="mb-4 h-1.5 overflow-hidden bg-slate-100">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((step, index) => {
                const Icon = step.icon;
                const active = index === currentStep;
                const complete = index < currentStep;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className="flex min-w-0 flex-col items-center gap-2 text-center"
                  >
                    <span
                      className={[
                        'flex h-10 w-10 items-center justify-center rounded-full border text-sm transition-colors',
                        active ? 'border-primary bg-primary text-white' : '',
                        complete ? 'border-primary bg-primary/10 text-primary' : '',
                        !active && !complete ? 'border-slate-200 bg-slate-100 text-slate-500' : '',
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={['truncate text-[10px] font-bold uppercase tracking-wider', active ? 'text-primary' : 'text-muted-foreground'].join(' ')}>
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {currentStepKey === 'contato' ? (
              <div className="space-y-4">
                <Field label="Nome *">
                  <Input required placeholder="Nome e sobrenome" value={data.nome} onChange={(event) => set('nome', event.target.value)} className="h-9 rounded-none text-sm" />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Telefone *">
                    <Input
                      required
                      inputMode="numeric"
                      placeholder="DDD + numero"
                      maxLength={11}
                      value={data.telefone}
                      onChange={(event) => set('telefone', event.target.value.replace(/\D/g, '').slice(0, 11))}
                      className="h-9 rounded-none text-sm"
                    />
                    {telefoneError ? <p className="text-xs font-semibold text-red-600">{telefoneError}</p> : null}
                  </Field>
                  <Field label="E-mail">
                    <Input type="email" value={data.email} onChange={(event) => set('email', event.target.value)} className="h-9 rounded-none text-sm" />
                  </Field>
                </div>
              </div>
            ) : null}

            {currentStepKey === 'comercial' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Origem">
                  <Select value={data.origem_id} onValueChange={(value) => set('origem_id', value)}>
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      {origensSelecionaveis.map((origem) => (
                        <SelectItem key={origem.id} value={origem.id}>
                          {origem.nome}{!origem.ativo ? ' (inativa)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={data.status} onValueChange={(value) => set('status', value)}>
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="tentativa_contato">Tentativa de contato</SelectItem>
                      <SelectItem value="em_contato">Em contato</SelectItem>
                      <SelectItem value="qualificado">Qualificado</SelectItem>
                      <SelectItem value="proposta">Proposta</SelectItem>
                      <SelectItem value="convertido">Convertido</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Previsao de fechamento">
                  <Input
                    type="date"
                    value={data.previsao_fechamento || ''}
                    onChange={(event) => set('previsao_fechamento', event.target.value)}
                    className="h-9 rounded-none text-sm"
                  />
                </Field>
              </div>
            ) : null}

            {currentStepKey === 'veiculo' ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Categoria do veiculo (segmento)">
                    <Select
                      value={data.veiculo_interesse?.categoria_veiculo_id || 'nenhuma'}
                      onValueChange={(value) => setData((current) => ({
                        ...current,
                        veiculo_interesse: {
                          ...(current.veiculo_interesse || {}),
                          categoria_veiculo_id: value === 'nenhuma' ? null : value,
                          marca_id: null,
                          marca_outro: '',
                          marca: '',
                          modelo_id: null,
                          modelo_outro: '',
                          modelo: '',
                        },
                      }))}
                    >
                      <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="nenhuma">Sem categoria</SelectItem>
                        {categoriasSelecionaveis.map((categoria) => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.nome}{!categoria.ativo ? ' (inativa)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Marca">
                    <Select
                      value={data.veiculo_interesse?.marca_id || (data.veiculo_interesse?.marca_outro ? 'outra' : '')}
                      onValueChange={setMarca}
                      disabled={!data.veiculo_interesse?.categoria_veiculo_id}
                    >
                      <SelectTrigger className="h-9 rounded-none text-sm">
                        <SelectValue placeholder={data.veiculo_interesse?.categoria_veiculo_id ? 'Selecione a marca' : 'Selecione o segmento primeiro'} />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {marcasSelecionaveis.map((marca) => (
                          <SelectItem key={marca.id} value={marca.id}>
                            {marca.nome}{!marca.ativo ? ' (inativa)' : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="outra">Nao encontrei a marca</SelectItem>
                      </SelectContent>
                    </Select>
                    {!data.veiculo_interesse?.marca_id ? (
                      <Input
                        placeholder="Digite a marca"
                        value={data.veiculo_interesse?.marca_outro || ''}
                        onChange={(event) => setMarcaOutro(event.target.value)}
                        className="mt-2 h-9 rounded-none text-sm"
                      />
                    ) : null}
                  </Field>
                  <Field label="Modelo">
                    <Select
                      value={data.veiculo_interesse?.modelo_id || (data.veiculo_interesse?.modelo_outro ? 'outro' : '')}
                      onValueChange={setModelo}
                      disabled={!data.veiculo_interesse?.marca_id}
                    >
                      <SelectTrigger className="h-9 rounded-none text-sm">
                        <SelectValue placeholder={data.veiculo_interesse?.marca_id ? 'Selecione o modelo' : 'Selecione a marca primeiro'} />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {modelosSelecionaveis.map((modelo) => (
                          <SelectItem key={modelo.id} value={modelo.id}>
                            {modelo.nome}{!modelo.ativo ? ' (inativo)' : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="outro">Nao encontrei o modelo</SelectItem>
                      </SelectContent>
                    </Select>
                    {!data.veiculo_interesse?.modelo_id ? (
                      <Input
                        placeholder="Digite o modelo"
                        value={data.veiculo_interesse?.modelo_outro || ''}
                        onChange={(event) => setModeloOutro(event.target.value)}
                        className="mt-2 h-9 rounded-none text-sm"
                      />
                    ) : null}
                  </Field>
                  <Field label="Ano">
                    <Input type="number" min="1900" max="2100" value={data.veiculo_interesse?.ano || ''} onChange={(event) => setVehicle('ano', event.target.value)} className="h-9 rounded-none text-sm" />
                  </Field>
                  <Field label="Condicao">
                    <Select value={data.veiculo_interesse?.condicao || 'novo'} onValueChange={(value) => setVehicle('condicao', value)}>
                      <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="novo">Novo</SelectItem>
                        <SelectItem value="seminovo">Seminovo</SelectItem>
                        <SelectItem value="usado">Usado</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMaisDetalhesVeiculo((value) => !value)}
                  className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  {showMaisDetalhesVeiculo ? 'Ocultar detalhes' : 'Mais detalhes'}
                </button>
                {showMaisDetalhesVeiculo ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Versao">
                      <Input value={data.veiculo_interesse?.versao || ''} onChange={(event) => setVehicle('versao', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                    <Field label="Cor preferida">
                      <Input value={data.veiculo_interesse?.cor_preferida || ''} onChange={(event) => setVehicle('cor_preferida', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                    <Field label="Preco minimo">
                      <Input type="number" min="0" value={data.veiculo_interesse?.faixa_preco_min || ''} onChange={(event) => setVehicle('faixa_preco_min', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                    <Field label="Preco maximo">
                      <Input type="number" min="0" value={data.veiculo_interesse?.faixa_preco_max || ''} onChange={(event) => setVehicle('faixa_preco_max', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                    <Field label="Combustivel">
                      <Input value={data.veiculo_interesse?.combustivel || ''} onChange={(event) => setVehicle('combustivel', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                    <Field label="Cambio">
                      <Input value={data.veiculo_interesse?.cambio || ''} onChange={(event) => setVehicle('cambio', event.target.value)} className="h-9 rounded-none text-sm" />
                    </Field>
                  </div>
                ) : null}
                {camposExtraSegmento.length > 0 ? (
                  <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
                    {camposExtraSegmento.map((campo) => (
                      <Field key={campo.chave} label={campo.label || campo.chave}>
                        {campo.tipo === 'opcao' ? (
                          <Select
                            value={data.veiculo_interesse?.atributos?.[campo.chave] || ''}
                            onValueChange={(value) => setAtributo(campo.chave, value)}
                          >
                            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-none">
                              {(campo.opcoes || []).map((opcao) => (
                                <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={campo.tipo === 'numero' ? 'number' : 'text'}
                            value={data.veiculo_interesse?.atributos?.[campo.chave] ?? ''}
                            onChange={(event) => setAtributo(campo.chave, event.target.value)}
                            className="h-9 rounded-none text-sm"
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                ) : null}
                <Field label="Observacoes do veiculo">
                  <Textarea
                    value={data.veiculo_interesse?.observacoes || ''}
                    onChange={(event) => setVehicle('observacoes', event.target.value)}
                    className="resize-none rounded-none text-sm"
                    rows={3}
                  />
                </Field>
              </div>
            ) : null}

            {currentStepKey === 'responsavel' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Unidade *">
                  <Select value={data.unidade_id || ''} onValueChange={setUnidade}>
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      {unidades.map((unidade) => (
                        <SelectItem key={unidade.id} value={unidade.id}>{unidade.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {unidadeError ? <p className="text-xs font-semibold text-red-600">{unidadeError}</p> : null}
                </Field>
                <Field label="Responsavel">
                  <Select
                    value={data.responsavel_id || 'automatico'}
                    onValueChange={(value) => set('responsavel_id', value === 'automatico' ? '' : value)}
                  >
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="automatico">Distribuicao automatica</SelectItem>
                      {responsaveisDaUnidade.map((responsavel) => (
                        <SelectItem key={responsavel.id} value={responsavel.id}>
                          {responsavel.nome}{responsavel.distribuicao_ativa === false ? ' (fora da distribuicao automatica)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}

            {currentStepKey === 'observacoes' ? (
              <div className="space-y-4">
                {data.status === 'perdido' ? (
                  <Field label="Motivo da perda *">
                    <Textarea
                      required
                      value={data.motivo_perda || ''}
                      onChange={(event) => set('motivo_perda', event.target.value)}
                      className="resize-none rounded-none text-sm"
                      rows={3}
                    />
                  </Field>
                ) : null}
                <Field label="Observacoes comerciais">
                  <Textarea
                    value={data.observacoes || ''}
                    onChange={(event) => set('observacoes', event.target.value)}
                    className="resize-none rounded-none text-sm"
                    rows={6}
                  />
                </Field>
              </div>
            ) : null}

            {currentStepKey === 'historico' ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notas do lead</Label>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{notes.length} notas</span>
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder="Registrar nota comercial..."
                      className="resize-none rounded-none text-sm"
                      rows={2}
                    />
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" disabled={!noteText.trim() || addingNote} onClick={saveNote} className="h-8 rounded-none text-xs font-bold uppercase tracking-wider">
                        {addingNote ? 'Registrando...' : 'Adicionar nota'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto border-t pt-3">
                    {notes.length === 0 ? (
                      <p className="py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Nenhuma nota registrada</p>
                    ) : notes.map((note) => (
                      <div key={note.id} className="bg-slate-50 p-3">
                        <p className="text-sm text-slate-800">{note.descricao}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{formatDate(note.created_date)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Anexos do lead</Label>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{attachments.length} anexos</span>
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-border bg-slate-50 px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-slate-100">
                    {uploadingAttachment ? (
                      'Enviando...'
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Adicionar anexo
                      </>
                    )}
                    <input type="file" className="hidden" disabled={uploadingAttachment} onChange={addAttachment} />
                  </label>
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto border-t pt-3">
                    {attachments.length === 0 ? (
                      <p className="py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Nenhum anexo registrado</p>
                    ) : attachments.map((attachment) => {
                      const pending = Boolean(attachment.metadados?.pendente);
                      const hasPath = Boolean(attachment.metadados?.path);
                      return (
                        <div key={attachment.id} className="flex items-center justify-between gap-3 bg-slate-50 p-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 truncate text-sm font-semibold text-slate-800">
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              {attachment.metadados?.nome || attachment.descricao}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {pending ? 'Enviando...' : `${formatBytes(attachment.metadados?.tamanho)} | ${formatDate(attachment.created_date)}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={pending || !hasPath}
                              className="h-8 w-8 rounded-none"
                              onClick={() => onOpenAttachment?.(attachment)}
                              title="Abrir anexo"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={pending || deletingAttachment}
                              className="h-8 w-8 rounded-none text-red-600 hover:text-red-700"
                              onClick={() => onDeleteAttachment?.(attachment)}
                              title="Excluir anexo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-6 py-4">
            <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={currentStep === 0} className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={goBack}>
                Voltar
              </Button>
              {isLastStep ? (
                <Button type="submit" className="rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90">
                  Salvar
                </Button>
              ) : (
                <Button type="button" className="rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90" onClick={goNext}>
                  Proximo
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
