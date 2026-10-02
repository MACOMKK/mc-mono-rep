import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ETAPA_TIPO_LABEL } from '@/lib/leadStatus';

const CORES_PALETA = ['#3b82f6', '#16a34a', '#fbbf24', '#f87171', '#c084fc', '#06b6d4', '#f97316', '#94a3b8'];

function NovoPipelineDialog({ open, onOpenChange, onSave, saving }) {
  const [nome, setNome] = useState('');

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) setNome('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-none">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-widest">Novo Pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Nome do pipeline</Label>
          <Input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Instagram, Cursos e Mentorias"
            className="h-9 rounded-none"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nome.trim() || saving}
            className="rounded-none text-xs font-bold uppercase tracking-wider"
            onClick={() => onSave(nome.trim())}
          >
            {saving ? 'Criando...' : 'Criar pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaEtapaDialog({ open, onOpenChange, onSave, saving }) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_PALETA[0]);
  const [tipo, setTipo] = useState('em_andamento');

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setNome('');
      setCor(CORES_PALETA[0]);
      setTipo('em_andamento');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-none">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-widest">Nova Etapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Nome da etapa</Label>
            <Input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex.: Em negociação"
              className="h-9 rounded-none"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Tipo da etapa</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-9 rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ETAPA_TIPO_LABEL).map(([valor, label]) => (
                  <SelectItem key={valor} value={valor}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Em andamento: lead ativo (conta na distribuicao e no SLA). Ganho/Perdido: lead encerrado
              e com motivo obrigatorio. O tipo nao pode ser trocado depois que a etapa tiver leads.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Cor da etapa</Label>
            <div className="flex items-center gap-2">
              <span className="h-9 w-9 shrink-0 border" style={{ backgroundColor: cor }} />
              <Input
                value={cor}
                onChange={(event) => setCor(event.target.value)}
                className="h-9 rounded-none font-mono text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {CORES_PALETA.map((paletaCor) => (
                <button
                  key={paletaCor}
                  type="button"
                  onClick={() => setCor(paletaCor)}
                  className={cn('h-7 w-7 border-2', cor === paletaCor ? 'border-[#1a1a1a]' : 'border-transparent')}
                  style={{ backgroundColor: paletaCor }}
                  aria-label={`Selecionar cor ${paletaCor}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nome.trim() || saving}
            className="rounded-none text-xs font-bold uppercase tracking-wider"
            onClick={() => onSave({ nome: nome.trim(), cor, tipo })}
          >
            {saving ? 'Criando...' : 'Criar etapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Pipelines() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const podeConfigurar = user?.role === 'admin' || user?.role === 'manager';

  const [pipelineSelecionadoId, setPipelineSelecionadoId] = useState(null);
  const [novoPipelineAberto, setNovoPipelineAberto] = useState(false);
  const [novaEtapaAberta, setNovaEtapaAberta] = useState(false);
  const [etapaParaExcluir, setEtapaParaExcluir] = useState(null);

  const { data: pipelines = [], isLoading: carregandoPipelines } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmDataClient.entities.Pipeline.list('nome'),
    enabled: podeConfigurar,
  });

  useEffect(() => {
    if (!pipelineSelecionadoId && pipelines.length > 0) {
      const padrao = pipelines.find((pipeline) => pipeline.padrao) || pipelines[0];
      setPipelineSelecionadoId(padrao.id);
    }
  }, [pipelineSelecionadoId, pipelines]);

  const { data: etapas = [], isLoading: carregandoEtapas } = useQuery({
    queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId],
    enabled: podeConfigurar && Boolean(pipelineSelecionadoId),
    queryFn: () => crmDataClient.entities.EtapaPipeline.listPage({
      orderBy: 'ordem',
      filters: { pipeline_id: pipelineSelecionadoId },
      limit: 100,
    }).then((result) => result.rows),
  });

  const criarPipelineMutation = useMutation({
    mutationFn: (nome) => crmDataClient.entities.Pipeline.create({ nome }),
    onSuccess: async (pipeline) => {
      await queryClient.invalidateQueries({ queryKey: ['crm-pipelines'] });
      setPipelineSelecionadoId(pipeline.id);
      setNovoPipelineAberto(false);
      toast({ title: 'Pipeline criado', variant: 'success' });
    },
    onError: (error) => toast({ title: 'Nao foi possivel criar o pipeline', description: error.message, variant: 'destructive' }),
  });

  const proximaOrdem = (lista) => lista.reduce((maior, etapa) => Math.max(maior, etapa.ordem), -1) + 1;

  const criarEtapaMutation = useMutation({
    mutationFn: ({ nome, cor, tipo }) => crmDataClient.entities.EtapaPipeline.create({
      pipeline_id: pipelineSelecionadoId,
      nome,
      cor,
      tipo,
      ordem: proximaOrdem(etapas),
    }),
    onMutate: async ({ nome, cor, tipo }) => {
      setNovaEtapaAberta(false);
      const queryKey = ['crm-etapas-pipeline', pipelineSelecionadoId];
      await queryClient.cancelQueries({ queryKey });
      const etapasAnteriores = queryClient.getQueryData(queryKey);
      const etapaTemporaria = {
        id: `temp-${Date.now()}`,
        pipeline_id: pipelineSelecionadoId,
        nome,
        cor,
        ordem: proximaOrdem(etapas),
        tipo,
        chave_sistema: null,
        _otimista: true,
      };
      queryClient.setQueryData(queryKey, (atual = []) => [...atual, etapaTemporaria]);
      return { etapasAnteriores, queryKey };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId] });
      toast({ title: 'Etapa criada', variant: 'success' });
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.etapasAnteriores);
      toast({ title: 'Nao foi possivel criar a etapa', description: error.message, variant: 'destructive' });
    },
  });

  const atualizarEtapaMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.EtapaPipeline.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId] });
    },
    onError: (error) => toast({ title: 'Nao foi possivel atualizar a etapa', description: error.message, variant: 'destructive' }),
  });

  const excluirEtapaMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.EtapaPipeline.delete(id),
    onMutate: async (id) => {
      const queryKey = ['crm-etapas-pipeline', pipelineSelecionadoId];
      await queryClient.cancelQueries({ queryKey });
      const etapasAnteriores = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (atual = []) => atual.filter((etapa) => etapa.id !== id));
      return { etapasAnteriores, queryKey };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId] });
      toast({ title: 'Etapa excluida', variant: 'success' });
    },
    onError: (error, _id, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.etapasAnteriores);
      toast({ title: 'Nao foi possivel excluir a etapa', description: error.message, variant: 'destructive' });
    },
  });

  if (!podeConfigurar) {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar pipelines.</div>;
  }

  const atualizarOrdemEtapa = (etapa, ordem) => crmDataClient.entities.EtapaPipeline.update(etapa.id, {
    pipeline_id: etapa.pipeline_id,
    nome: etapa.nome,
    cor: etapa.cor,
    ordem,
  });

  const handleDragEnd = async (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    const queryKey = ['crm-etapas-pipeline', pipelineSelecionadoId];
    const etapasAnteriores = etapas;

    const reordenadas = Array.from(etapas);
    const [movida] = reordenadas.splice(sourceIndex, 1);
    reordenadas.splice(destIndex, 0, movida);
    queryClient.setQueryData(queryKey, reordenadas);

    try {
      // Busca a lista real do servidor (nao confia que o estado local, que
      // pode estar em transicao por causa de uma criacao/exclusao recente
      // ainda nao confirmada, reflita o `ordem` atual de cada etapa).
      const etapasServidor = await crmDataClient.entities.EtapaPipeline.listPage({
        orderBy: 'ordem',
        filters: { pipeline_id: pipelineSelecionadoId },
        limit: 100,
      }).then((result) => result.rows);

      const porId = new Map(etapasServidor.map((etapa) => [etapa.id, etapa]));
      const ordemFinal = reordenadas
        .map((etapa) => porId.get(etapa.id))
        .filter(Boolean);

      if (ordemFinal.length !== etapasServidor.length) {
        throw new Error('A lista de etapas mudou enquanto voce arrastava. Tente novamente.');
      }

      // Indexacao fracionaria: `ordem` nao e mais uma sequencia fechada, so
      // uma posicao relativa. Mover uma etapa so precisa de um novo valor
      // entre as duas vizinhas do destino -- nenhuma outra linha e tocada, e
      // o resultado nunca colide com um valor existente.
      const movidaFinal = ordemFinal[destIndex];
      const vizinhoAnterior = ordemFinal[destIndex - 1];
      const vizinhoSeguinte = ordemFinal[destIndex + 1];
      let novoOrdem;
      if (!vizinhoAnterior) {
        novoOrdem = Number(vizinhoSeguinte.ordem) - 1;
      } else if (!vizinhoSeguinte) {
        novoOrdem = Number(vizinhoAnterior.ordem) + 1;
      } else {
        novoOrdem = (Number(vizinhoAnterior.ordem) + Number(vizinhoSeguinte.ordem)) / 2;
      }

      await atualizarOrdemEtapa(movidaFinal, novoOrdem);

      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      queryClient.setQueryData(queryKey, etapasAnteriores);
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Nao foi possivel reordenar as etapas', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Pipelines</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Crie funis diferentes para cada tipo de atendimento. Etapas marcadas como "Sistema" nao
          podem ser excluidas — a distribuicao automatica de leads depende delas.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b bg-white p-3">
        {carregandoPipelines ? <p className="text-sm text-muted-foreground">Carregando pipelines...</p> : null}
        {pipelines.map((pipeline) => (
          <Button
            key={pipeline.id}
            type="button"
            variant={pipeline.id === pipelineSelecionadoId ? 'default' : 'outline'}
            className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
            onClick={() => setPipelineSelecionadoId(pipeline.id)}
          >
            {pipeline.nome}
            {pipeline.padrao ? <span className="ml-2 rounded-sm bg-white/20 px-1.5 py-0.5 text-[9px]">Padrão</span> : null}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
          onClick={() => setNovoPipelineAberto(true)}
        >
          <Plus className="mr-2 h-4 w-4" /> Novo pipeline
        </Button>
      </div>

      {carregandoEtapas ? <p className="py-10 text-sm text-muted-foreground">Carregando etapas...</p> : null}

      {!carregandoEtapas && pipelineSelecionadoId ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="etapas-pipeline">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {etapas.map((etapa, index) => (
                  <Draggable key={etapa.id} draggableId={etapa.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={cn(
                          'flex items-center gap-3 border bg-white p-3',
                          dragSnapshot.isDragging ? 'shadow-xl' : '',
                        )}
                      >
                        <span {...dragProvided.dragHandleProps} className="cursor-grab text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <span className="h-6 w-6 shrink-0 border" style={{ backgroundColor: etapa.cor }} />
                        <Input
                          defaultValue={etapa.nome}
                          className="h-9 max-w-xs rounded-none"
                          onBlur={(event) => {
                            const nome = event.target.value.trim();
                            if (nome && nome !== etapa.nome) {
                              atualizarEtapaMutation.mutate({ id: etapa.id, pipeline_id: etapa.pipeline_id, nome, cor: etapa.cor, ordem: etapa.ordem });
                            }
                          }}
                        />
                        <Input
                          defaultValue={etapa.cor}
                          className="h-9 w-28 rounded-none font-mono text-xs"
                          onBlur={(event) => {
                            const cor = event.target.value.trim();
                            if (cor && cor !== etapa.cor) {
                              atualizarEtapaMutation.mutate({ id: etapa.id, pipeline_id: etapa.pipeline_id, nome: etapa.nome, cor, ordem: etapa.ordem });
                            }
                          }}
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {ETAPA_TIPO_LABEL[etapa.tipo] || etapa.tipo}
                        </span>
                        {etapa.chave_sistema ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <Lock className="h-3 w-3" /> Sistema
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="ml-auto h-8 w-8 rounded-none text-red-600 disabled:opacity-30"
                          disabled={Boolean(etapa.chave_sistema) || Boolean(etapa._otimista)}
                          title={etapa.chave_sistema ? 'Etapas de sistema nao podem ser excluidas' : 'Excluir etapa'}
                          onClick={() => setEtapaParaExcluir(etapa)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {etapas.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma etapa cadastrada neste pipeline.</p>
                ) : null}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : null}

      {pipelineSelecionadoId ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full rounded-none text-xs font-bold uppercase tracking-wider"
          onClick={() => setNovaEtapaAberta(true)}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar etapa
        </Button>
      ) : null}

      <NovoPipelineDialog
        open={novoPipelineAberto}
        onOpenChange={setNovoPipelineAberto}
        saving={criarPipelineMutation.isPending}
        onSave={(nome) => criarPipelineMutation.mutate(nome)}
      />

      <NovaEtapaDialog
        open={novaEtapaAberta}
        onOpenChange={setNovaEtapaAberta}
        saving={criarEtapaMutation.isPending}
        onSave={(data) => criarEtapaMutation.mutate(data)}
      />

      <AlertDialog open={Boolean(etapaParaExcluir)} onOpenChange={(open) => !open && setEtapaParaExcluir(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-widest">Excluir etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a etapa "{etapaParaExcluir?.nome}"? Essa acao nao pode ser desfeita.
              Etapas com leads nao podem ser excluidas: mova os leads para outra etapa antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs font-bold uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 text-xs font-bold uppercase tracking-wider hover:bg-red-700"
              onClick={() => {
                excluirEtapaMutation.mutate(etapaParaExcluir.id);
                setEtapaParaExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
