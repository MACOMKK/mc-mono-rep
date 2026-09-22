import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Spinner,
  useToast,
} from '@macom/ui';

import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import Permissoes from '@/pages/Permissoes';

function formatData(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Fallback pra inscricoes antigas (de antes desta coluna existir) ou de navegadores sem
// User-Agent Client Hints -- so cobre os casos mais comuns, sem pretensao de ser um parser
// completo de user-agent.
function resumoDispositivoPorUserAgent(userAgent) {
  if (!userAgent) return 'Dispositivo desconhecido';

  let navegador = 'Navegador desconhecido';
  if (/Edg\//.test(userAgent)) navegador = 'Edge';
  else if (/OPR\//.test(userAgent)) navegador = 'Opera';
  else if (/Chrome\//.test(userAgent)) navegador = 'Chrome';
  else if (/Firefox\//.test(userAgent)) navegador = 'Firefox';
  else if (/Safari\//.test(userAgent)) navegador = 'Safari';

  let sistema = '';
  if (/Windows/.test(userAgent)) sistema = 'Windows';
  else if (/Android/.test(userAgent)) sistema = 'Android';
  else if (/iPhone|iPad|iOS/.test(userAgent)) sistema = 'iOS';
  else if (/Mac OS X/.test(userAgent)) sistema = 'macOS';
  else if (/Linux/.test(userAgent)) sistema = 'Linux';

  return sistema ? `${navegador} · ${sistema}` : navegador;
}

// Usa o dado estruturado capturado na inscricao (User-Agent Client Hints, ver
// packages/push/src/pushClient.js -> detectarDispositivo) quando disponivel -- mais confiavel
// que reinterpretar o user_agent bruto, que o Chrome vem "congelando" por privacidade. Cai pro
// parse antigo so pra inscricoes feitas antes dessa coluna existir.
function resumoDispositivo(sub) {
  if (sub.navegador || sub.sistema_operacional) {
    const tipo = sub.tipo_dispositivo === 'mobile' ? ' (mobile)' : '';
    return [sub.navegador, sub.sistema_operacional].filter(Boolean).join(' · ') + tipo;
  }
  return resumoDispositivoPorUserAgent(sub.user_agent);
}

function NotificacoesPushTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revogarAlvo, setRevogarAlvo] = useState(null);

  const subscricoesQuery = useQuery({
    queryKey: ['servicos', 'push-subscriptions'],
    queryFn: () => financeiroApi.pushSubscriptions.list(),
  });
  const subscricoes = subscricoesQuery.data || [];

  const revogarMutation = useMutation({
    mutationFn: (id) => financeiroApi.pushSubscriptions.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'push-subscriptions'] });
      toast({ title: 'Inscrição removida' });
      setRevogarAlvo(null);
    },
    onError: (error) => toast({ title: 'Não foi possível remover a inscrição', description: error.message }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Notificações push</h2>
        <p className="text-sm text-muted-foreground">
          Colaboradores com notificações push ativadas. Use &quot;Remover&quot; se alguém parar de
          receber notificações.
        </p>
      </div>

      {subscricoesQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Carregando...
        </div>
      ) : subscricoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum colaborador ativou notificações push ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Ativado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscricoes.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="font-medium">{sub.nome}</div>
                    <div className="text-xs text-muted-foreground">{sub.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{resumoDispositivo(sub)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatData(sub.criado_em)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRevogarAlvo(sub)}>
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(revogarAlvo)}
        onOpenChange={(open) => !open && setRevogarAlvo(null)}
        onConfirm={() => revogarMutation.mutate(revogarAlvo.id)}
        isLoading={revogarMutation.isPending}
        title="Remover inscrição de notificação"
        description={
          revogarAlvo
            ? `Isso remove a inscrição de push de "${resumoDispositivo(revogarAlvo)}" para ${revogarAlvo.nome}. Ele(a) vai precisar autorizar notificações de novo nesse dispositivo.`
            : ''
        }
        confirmLabel="Remover"
      />
    </div>
  );
}

function configParaRascunho(config) {
  return {
    restringir_visibilidade_pagamento_dinheiro: config?.restringir_visibilidade_pagamento_dinheiro ?? true,
    suprimento_caixa_sem_aprovador: config?.suprimento_caixa_sem_aprovador ?? false,
    suprimento_caixa_auto_aprovar: config?.suprimento_caixa_auto_aprovar ?? false,
    suprimento_caixa_departamentos_permitidos: config?.suprimento_caixa_departamentos_permitidos || [],
    restringir_reprovacao_contas_a_pagar: config?.restringir_reprovacao_contas_a_pagar ?? true,
  };
}

function FinanceiroTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState(null);

  const configQuery = useQuery({
    queryKey: ['servicos', 'configuracao-modulo'],
    queryFn: () => financeiroApi.configuracaoModulo.get(),
  });

  const departamentosQuery = useQuery({
    queryKey: ['servicos', 'departamentos'],
    queryFn: () => financeiroApi.departamentos.list(),
  });
  const departamentos = departamentosQuery.data || [];

  if (configQuery.data && rascunho === null) {
    setRascunho(configParaRascunho(configQuery.data));
  }

  const salvo = useMemo(() => configParaRascunho(configQuery.data), [configQuery.data]);
  const isDirty = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(salvo);

  const salvarMutation = useMutation({
    mutationFn: () => financeiroApi.configuracaoModulo.atualizar(rascunho),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'configuracao-modulo'] });
      setRascunho(configParaRascunho(data));
      toast({ title: 'Configurações salvas' });
    },
    onError: (error) => toast({ title: 'Não foi possível salvar', description: error.message }),
  });

  function setCampo(campo, valor) {
    setRascunho((atual) => ({ ...atual, [campo]: valor }));
  }

  function descartarAlteracoes() {
    setRascunho(salvo);
  }

  const restringir = rascunho?.restringir_visibilidade_pagamento_dinheiro ?? true;
  const suprimentoCaixaSemAprovador = rascunho?.suprimento_caixa_sem_aprovador ?? false;
  const suprimentoCaixaAutoAprovar = rascunho?.suprimento_caixa_auto_aprovar ?? false;
  const suprimentoCaixaDepartamentosPermitidos = rascunho?.suprimento_caixa_departamentos_permitidos || [];
  const restringirReprovacaoContasAPagar = rascunho?.restringir_reprovacao_contas_a_pagar ?? true;

  function toggleDepartamentoPermitido(departamentoId, checked) {
    const proximaLista = checked
      ? [...suprimentoCaixaDepartamentosPermitidos, departamentoId]
      : suprimentoCaixaDepartamentosPermitidos.filter((id) => id !== departamentoId);
    setCampo('suprimento_caixa_departamentos_permitidos', proximaLista);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Financeiro</h2>
        <p className="text-sm text-muted-foreground">Regras de visibilidade das solicitações de pagamento.</p>
      </div>

      {configQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Carregando...
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-medium">Restringir visibilidade de solicitações em dinheiro</p>
            <p className="text-sm text-muted-foreground">
              Quando ativo, uma solicitação com forma de pagamento &quot;Dinheiro&quot; fica visível
              apenas para quem a abriu, o aprovador designado e o financeiro — o papel &quot;contas a
              pagar&quot; não vê nem paga essas solicitações, e a regra de visibilidade por setor não se
              aplica a elas.
            </p>
          </div>
          <Switch
            checked={restringir}
            onCheckedChange={(checked) => setCampo('restringir_visibilidade_pagamento_dinheiro', checked)}
            disabled={salvarMutation.isPending}
          />
        </div>
      )}

      {!configQuery.isLoading && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-medium">Restringir reprovação após aprovação ao financeiro</p>
            <p className="text-sm text-muted-foreground">
              Quando ativo, só o financeiro pode reprovar uma solicitação já aprovada (tela
              Pagamentos). Quando desativado, o papel &quot;contas a pagar&quot; também pode
              reprovar uma solicitação já aprovada — não afeta a reprovação de solicitações ainda
              pendentes, que continua exclusiva do aprovador designado e do financeiro.
            </p>
          </div>
          <Switch
            checked={restringirReprovacaoContasAPagar}
            onCheckedChange={(checked) => setCampo('restringir_reprovacao_contas_a_pagar', checked)}
            disabled={salvarMutation.isPending}
          />
        </div>
      )}

      {!configQuery.isLoading && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-medium">Suprimento de caixa sem aprovador</p>
            <p className="text-sm text-muted-foreground">
              Quando ativo, solicitações de suprimento de caixa não exigem escolher um aprovador —
              o financeiro (Gerente) aprova e paga diretamente.
            </p>
          </div>
          <Switch
            checked={suprimentoCaixaSemAprovador}
            onCheckedChange={(checked) => setCampo('suprimento_caixa_sem_aprovador', checked)}
            disabled={salvarMutation.isPending}
          />
        </div>
      )}

      {!configQuery.isLoading && suprimentoCaixaSemAprovador && (
        <div className="ml-4 flex items-start justify-between gap-4 rounded-lg border border-dashed border-border bg-card p-4">
          <div>
            <p className="font-medium">Aprovar automaticamente</p>
            <p className="text-sm text-muted-foreground">
              Quando ativo, a solicitação já nasce aprovada e cai direto na fila de pagamento.
              Quando desativado, ela ainda passa por Aprovações — o financeiro (Gerente) aprova
              manualmente antes de pagar.
            </p>
          </div>
          <Switch
            checked={suprimentoCaixaAutoAprovar}
            onCheckedChange={(checked) => setCampo('suprimento_caixa_auto_aprovar', checked)}
            disabled={!suprimentoCaixaSemAprovador || salvarMutation.isPending}
          />
        </div>
      )}

      {!configQuery.isLoading && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">Departamentos autorizados a abrir suprimento de caixa</p>
          <p className="text-sm text-muted-foreground">
            Quando um ou mais departamentos forem selecionados, só colaboradores desses setores
            podem criar uma solicitação de suprimento de caixa. Vazio = qualquer colaborador com
            acesso ao Financeiro pode abrir. Não afeta quem pode ver solicitações já existentes.
          </p>
          {departamentosQuery.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Carregando...
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {departamentos.map((departamento) => (
                <label key={departamento.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={suprimentoCaixaDepartamentosPermitidos.includes(departamento.id)}
                    onCheckedChange={(checked) => toggleDepartamentoPermitido(departamento.id, checked === true)}
                    disabled={salvarMutation.isPending}
                  />
                  {departamento.nome}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {!configQuery.isLoading && (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background py-3">
          {isDirty && (
            <Button type="button" variant="ghost" onClick={descartarAlteracoes} disabled={salvarMutation.isPending}>
              Descartar alterações
            </Button>
          )}
          <Button type="button" onClick={() => salvarMutation.mutate()} disabled={!isDirty || salvarMutation.isPending}>
            {salvarMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      )}
    </div>
  );
}

function avisoParaRascunho(aviso) {
  return {
    id: aviso?.id || null,
    titulo: aviso?.titulo || '',
    mensagem: aviso?.mensagem || '',
    obrigatorio: aviso?.obrigatorio ?? true,
    ativo: aviso?.ativo ?? false,
    modoTeste: aviso?.modo_teste ?? false,
    requerAtualizacao: aviso?.requer_atualizacao ?? false,
  };
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('pt-BR');
}

function HistoricoAvisos({ onEditar, editandoId }) {
  const historicoQuery = useQuery({
    queryKey: ['servicos', 'avisos-historico'],
    queryFn: () => financeiroApi.avisos.listar(),
  });

  if (historicoQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        Carregando histórico...
      </div>
    );
  }

  const avisos = historicoQuery.data || [];
  if (avisos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum aviso criado ainda.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {avisos.map((aviso) => (
        <div
          key={aviso.id}
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 ${
            editandoId === aviso.id ? 'bg-primary/5' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{aviso.titulo}</p>
            <span className="shrink-0 text-xs text-muted-foreground">v{aviso.versao}</span>
            {aviso.ativo && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Ativo
              </span>
            )}
            {aviso.modo_teste && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Teste
              </span>
            )}
            {aviso.requer_atualizacao && (
              <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                Atualização
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span>{formatarDataHora(aviso.criado_em)}</span>
            <span>
              {aviso.total_aceites}/{aviso.total_usuarios_atingidos} confirmaram
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEditar(aviso)}>
              {editandoId === aviso.id ? 'Editando' : 'Editar'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AvisoFormDialog({ open, onOpenChange, rascunho, setRascunho, onSalvar, salvando }) {
  function setCampo(campo, valor) {
    setRascunho((atual) => ({ ...atual, [campo]: valor }));
  }

  const podeSalvar = Boolean(rascunho?.titulo?.trim()) && Boolean(rascunho?.mensagem?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rascunho?.id ? 'Editar aviso' : 'Criar novo aviso'}</DialogTitle>
          <DialogDescription>
            Exibido em tela cheia para os colaboradores até clicarem em &quot;Li e estou ciente&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aviso-titulo">Título</Label>
            <Input
              id="aviso-titulo"
              value={rascunho?.titulo || ''}
              onChange={(event) => setCampo('titulo', event.target.value)}
              disabled={salvando}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aviso-mensagem">Mensagem</Label>
            <Textarea
              id="aviso-mensagem"
              rows={4}
              value={rascunho?.mensagem || ''}
              onChange={(event) => setCampo('mensagem', event.target.value)}
              disabled={salvando}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">
                Aceite obrigatório
                <span className="block text-xs text-muted-foreground">Bloqueia a tela até aceitar</span>
              </span>
              <Switch
                checked={rascunho?.obrigatorio ?? true}
                onCheckedChange={(checked) => setCampo('obrigatorio', checked)}
                disabled={salvando}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">
                Ativo
                <span className="block text-xs text-muted-foreground">Passa a ser exibido aos colaboradores</span>
              </span>
              <Switch
                checked={rascunho?.ativo ?? false}
                onCheckedChange={(checked) => setCampo('ativo', checked)}
                disabled={salvando}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">
                Modo teste
                <span className="block text-xs text-muted-foreground">Só você vê o bloqueio, ninguém mais</span>
              </span>
              <Switch
                checked={rascunho?.modoTeste ?? false}
                onCheckedChange={(checked) => setCampo('modoTeste', checked)}
                disabled={salvando}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">
                Exige atualização
                <span className="block text-xs text-muted-foreground">
                  Ao aceitar, recarrega a página do colaborador (use para avisar sobre um deploy novo)
                </span>
              </span>
              <Switch
                checked={rascunho?.requerAtualizacao ?? false}
                onCheckedChange={(checked) => setCampo('requerAtualizacao', checked)}
                disabled={salvando}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onSalvar} disabled={!podeSalvar || salvando}>
            {salvando ? 'Salvando...' : 'Salvar aviso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvisoTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rascunho, setRascunho] = useState(null);
  const [conflito, setConflito] = useState(null);

  const salvarMutation = useMutation({
    mutationFn: (forcarInativarAnterior) => financeiroApi.avisos.salvar({ ...rascunho, forcarInativarAnterior }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'aviso-ativo'] });
      queryClient.invalidateQueries({ queryKey: ['servicos', 'avisos-historico'] });
      toast({ title: 'Aviso salvo' });
      setDialogOpen(false);
      setConflito(null);
    },
    onError: (error) => {
      if (error.status === 409) {
        setConflito(error.message);
        return;
      }
      toast({ title: 'Não foi possível salvar', description: error.message });
    },
  });

  function handleCriarNovo() {
    setRascunho(avisoParaRascunho(null));
    setDialogOpen(true);
  }

  function handleEditar(aviso) {
    setRascunho(avisoParaRascunho(aviso));
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Aviso de atualização</h2>
          <p className="text-sm text-muted-foreground">Aviso bloqueante até o colaborador confirmar a leitura.</p>
        </div>
        <Button type="button" onClick={handleCriarNovo}>
          Criar novo aviso
        </Button>
      </div>

      <HistoricoAvisos onEditar={handleEditar} editandoId={dialogOpen ? rascunho?.id : null} />

      <AvisoFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rascunho={rascunho}
        setRascunho={setRascunho}
        onSalvar={() => salvarMutation.mutate(false)}
        salvando={salvarMutation.isPending}
      />

      <ConfirmDeleteDialog
        open={Boolean(conflito)}
        onOpenChange={(open) => !open && setConflito(null)}
        onConfirm={() => salvarMutation.mutate(true)}
        isLoading={salvarMutation.isPending}
        title="Já existe um aviso ativo"
        description={`${conflito || ''} Inativar o anterior e ativar este agora?`}
        confirmLabel="Inativar e ativar este"
        cancelLabel="Cancelar"
      />
    </div>
  );
}

export default function Configuracoes() {
  const [tab, setTab] = useState('notificacoes');

  const tabs = useMemo(
    () => [
      { value: 'notificacoes', label: 'Notificações' },
      { value: 'permissoes', label: 'Permissões' },
      { value: 'financeiro', label: 'Financeiro' },
      { value: 'aviso', label: 'Aviso' },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Área administrativa do HUB.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {tabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="notificacoes" className="mt-4">
          <NotificacoesPushTab />
        </TabsContent>

        <TabsContent value="permissoes" className="mt-4">
          <Permissoes />
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4">
          <FinanceiroTab />
        </TabsContent>

        <TabsContent value="aviso" className="mt-4">
          <AvisoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
