import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

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

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setNome('');
      setCor(CORES_PALETA[0]);
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
            onClick={() => onSave({ nome: nome.trim(), cor })}
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

  const criarEtapaMutation = useMutation({
    mutationFn: ({ nome, cor }) => crmDataClient.entities.EtapaPipeline.create({
      pipeline_id: pipelineSelecionadoId,
      nome,
      cor,
      ordem: etapas.length,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId] });
      setNovaEtapaAberta(false);
      toast({ title: 'Etapa criada', variant: 'success' });
    },
    onError: (error) => toast({ title: 'Nao foi possivel criar a etapa', description: error.message, variant: 'destructive' }),
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-etapas-pipeline', pipelineSelecionadoId] });
      toast({ title: 'Etapa excluida', variant: 'success' });
    },
    onError: (error) => toast({ title: 'Nao foi possivel excluir a etapa', description: error.message, variant: 'destructive' }),
  });

  if (!podeConfigurar) {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar pipelines.</div>;
  }

  const handleDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;

    const reordenadas = Array.from(etapas);
    const [removida] = reordenadas.splice(result.source.index, 1);
    reordenadas.splice(result.destination.index, 0, removida);

    queryClient.setQueryData(['crm-etapas-pipeline', pipelineSelecionadoId], reordenadas);
    reordenadas.forEach((etapa, index) => {
      if (etapa.ordem !== index) {
        atualizarEtapaMutation.mutate({ id: etapa.id, pipeline_id: etapa.pipeline_id, nome: etapa.nome, cor: etapa.cor, ordem: index });
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
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
                          disabled={Boolean(etapa.chave_sistema)}
                          title={etapa.chave_sistema ? 'Etapas de sistema nao podem ser excluidas' : 'Excluir etapa'}
                          onClick={() => excluirEtapaMutation.mutate(etapa.id)}
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
    </div>
  );
}
