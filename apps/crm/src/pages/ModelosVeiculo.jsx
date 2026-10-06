import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

export default function ModelosVeiculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';
  const [novoNome, setNovoNome] = useState('');
  const [modeloParaExcluir, setModeloParaExcluir] = useState(null);
  const [novaMarcaId, setNovaMarcaId] = useState('');
  const [novaCategoriaId, setNovaCategoriaId] = useState('');
  const [novoAnoInicio, setNovoAnoInicio] = useState('');
  const [novoAnoFim, setNovoAnoFim] = useState('');

  const { data: modelos = [], isLoading, error } = useQuery({
    queryKey: ['crm-modelos-veiculo'],
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const { data: marcas = [] } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['crm-categorias-veiculo'],
    queryFn: () => crmDataClient.entities.CategoriaVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const marcaNomePorId = useMemo(() => Object.fromEntries(marcas.map((marca) => [marca.id, marca.nome])), [marcas]);
  const categoriaNomePorId = useMemo(() => Object.fromEntries(categorias.map((categoria) => [categoria.id, categoria.nome])), [categorias]);

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.ModeloVeiculo.create(data),
    onMutate: () => {
      setNovoNome('');
      setNovoAnoInicio('');
      setNovoAnoFim('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-modelos-veiculo'] });
      toast({ title: 'Modelo criado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar o modelo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.ModeloVeiculo.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-modelos-veiculo'] });
      toast({ title: 'Modelo atualizado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar o modelo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.ModeloVeiculo.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['crm-modelos-veiculo'] });
      const previousModelos = queryClient.getQueryData(['crm-modelos-veiculo']);
      queryClient.setQueryData(['crm-modelos-veiculo'], (old = []) => old.filter((modelo) => modelo.id !== id));
      return { previousModelos };
    },
    onSuccess: () => {
      toast({ title: 'Modelo excluido', variant: 'success' });
    },
    onError: (mutationError, _id, context) => {
      if (context?.previousModelos) {
        queryClient.setQueryData(['crm-modelos-veiculo'], context.previousModelos);
      }
      toast({
        title: 'Nao foi possivel excluir o modelo',
        description: mutationError.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-modelos-veiculo'] });
    },
  });

  if (!canConfigure) {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar modelos de veiculo.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome || !novaMarcaId || !novaCategoriaId) return;
    createMutation.mutate({
      nome,
      marca_id: novaMarcaId,
      categoria_veiculo_id: novaCategoriaId,
      ativo: true,
      ano_inicio: novoAnoInicio ? Number(novoAnoInicio) : null,
      ano_fim: novoAnoFim ? Number(novoAnoFim) : null,
    });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Modelos de Veiculo</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro livre (ex.: Civic, CG 160) usado no step Veiculo dos leads. O modelo amarra a
          marca ao segmento (ex.: Honda Civic = Carro, Honda CG = Moto).
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 grid gap-3 border-b bg-white p-5 md:grid-cols-[1fr_1fr_1fr_0.7fr_0.7fr_auto] md:items-end">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Marca</Label>
          <Select value={novaMarcaId} onValueChange={setNovaMarcaId}>
            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a marca" /></SelectTrigger>
            <SelectContent className="rounded-none">
              {marcas.map((marca) => (
                <SelectItem key={marca.id} value={marca.id}>{marca.nome}{!marca.ativo ? ' (inativa)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Segmento</Label>
          <Select value={novaCategoriaId} onValueChange={setNovaCategoriaId}>
            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione o segmento" /></SelectTrigger>
            <SelectContent className="rounded-none">
              {categorias.map((categoria) => (
                <SelectItem key={categoria.id} value={categoria.id}>{categoria.nome}{!categoria.ativo ? ' (inativa)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Novo modelo</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: Civic"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Ano inicio</Label>
          <Input
            type="number"
            min="1900"
            max="2100"
            value={novoAnoInicio}
            onChange={(event) => setNovoAnoInicio(event.target.value)}
            placeholder="Ex.: 2020"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Ano fim</Label>
          <Input
            type="number"
            min="1900"
            max="2100"
            value={novoAnoFim}
            onChange={(event) => setNovoAnoFim(event.target.value)}
            placeholder="Em producao"
            className="h-9 rounded-none"
          />
        </div>
        <Button
          type="submit"
          disabled={!novoNome.trim() || !novaMarcaId || !novaCategoriaId || createMutation.isPending}
          className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
        >
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando modelos...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && modelos.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>
      ) : null}

      {!isLoading && !error && modelos.length > 0 ? (
        <div className="overflow-hidden border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Nome</TableHead>
                <TableHead className="text-white">Marca</TableHead>
                <TableHead className="text-white">Segmento</TableHead>
                <TableHead className="text-white">Ano inicio</TableHead>
                <TableHead className="text-white">Ano fim</TableHead>
                <TableHead className="text-white">Ativo</TableHead>
                <TableHead className="text-white" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelos.map((modelo) => (
                <TableRow key={modelo.id}>
                  <TableCell>
                    <Input
                      defaultValue={modelo.nome}
                      className="h-9 max-w-xs rounded-none"
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== modelo.nome) {
                          updateMutation.mutate({
                            id: modelo.id,
                            nome,
                            marca_id: modelo.marca_id,
                            categoria_veiculo_id: modelo.categoria_veiculo_id,
                            ativo: modelo.ativo,
                            ano_inicio: modelo.ano_inicio ?? null,
                            ano_fim: modelo.ano_fim ?? null,
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={modelo.marca_id}
                      onValueChange={(marcaId) => {
                        if (marcaId !== modelo.marca_id) {
                          updateMutation.mutate({
                            id: modelo.id,
                            nome: modelo.nome,
                            marca_id: marcaId,
                            categoria_veiculo_id: modelo.categoria_veiculo_id,
                            ativo: modelo.ativo,
                            ano_inicio: modelo.ano_inicio ?? null,
                            ano_fim: modelo.ano_fim ?? null,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-40 rounded-none text-sm">
                        <SelectValue placeholder="Selecione a marca">{marcaNomePorId[modelo.marca_id] || '-'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {marcas.map((marca) => (
                          <SelectItem key={marca.id} value={marca.id}>{marca.nome}{!marca.ativo ? ' (inativa)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={modelo.categoria_veiculo_id}
                      onValueChange={(categoriaId) => {
                        if (categoriaId !== modelo.categoria_veiculo_id) {
                          updateMutation.mutate({
                            id: modelo.id,
                            nome: modelo.nome,
                            marca_id: modelo.marca_id,
                            categoria_veiculo_id: categoriaId,
                            ativo: modelo.ativo,
                            ano_inicio: modelo.ano_inicio ?? null,
                            ano_fim: modelo.ano_fim ?? null,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-40 rounded-none text-sm">
                        <SelectValue placeholder="Selecione o segmento">{categoriaNomePorId[modelo.categoria_veiculo_id] || '-'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {categorias.map((categoria) => (
                          <SelectItem key={categoria.id} value={categoria.id}>{categoria.nome}{!categoria.ativo ? ' (inativa)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1900"
                      max="2100"
                      defaultValue={modelo.ano_inicio ?? ''}
                      className="h-9 w-24 rounded-none"
                      onBlur={(event) => {
                        const valor = event.target.value ? Number(event.target.value) : null;
                        if (valor !== (modelo.ano_inicio ?? null)) {
                          updateMutation.mutate({
                            id: modelo.id,
                            nome: modelo.nome,
                            marca_id: modelo.marca_id,
                            categoria_veiculo_id: modelo.categoria_veiculo_id,
                            ativo: modelo.ativo,
                            ano_inicio: valor,
                            ano_fim: modelo.ano_fim ?? null,
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1900"
                      max="2100"
                      defaultValue={modelo.ano_fim ?? ''}
                      placeholder="Em producao"
                      className="h-9 w-28 rounded-none"
                      onBlur={(event) => {
                        const valor = event.target.value ? Number(event.target.value) : null;
                        if (valor !== (modelo.ano_fim ?? null)) {
                          updateMutation.mutate({
                            id: modelo.id,
                            nome: modelo.nome,
                            marca_id: modelo.marca_id,
                            categoria_veiculo_id: modelo.categoria_veiculo_id,
                            ativo: modelo.ativo,
                            ano_inicio: modelo.ano_inicio ?? null,
                            ano_fim: valor,
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={modelo.ativo}
                      onCheckedChange={(ativo) => updateMutation.mutate({
                        id: modelo.id,
                        nome: modelo.nome,
                        marca_id: modelo.marca_id,
                        categoria_veiculo_id: modelo.categoria_veiculo_id,
                        ativo,
                        ano_inicio: modelo.ano_inicio ?? null,
                        ano_fim: modelo.ano_fim ?? null,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-none text-red-600"
                      onClick={() => setModeloParaExcluir(modelo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {updateMutation.isPending ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Save className="h-3.5 w-3.5" /> Salvando...
        </div>
      ) : null}

      <AlertDialog open={Boolean(modeloParaExcluir)} onOpenChange={(open) => !open && setModeloParaExcluir(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-widest">Excluir modelo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o modelo "{modeloParaExcluir?.nome}"? Essa acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs font-bold uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 text-xs font-bold uppercase tracking-wider hover:bg-red-700"
              onClick={() => {
                deleteMutation.mutate(modeloParaExcluir.id);
                setModeloParaExcluir(null);
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
