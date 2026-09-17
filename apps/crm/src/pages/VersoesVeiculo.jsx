import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

export default function VersoesVeiculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';
  const [novoNome, setNovoNome] = useState('');
  const [novoModeloId, setNovoModeloId] = useState('');

  const { data: versoes = [], isLoading, error } = useQuery({
    queryKey: ['crm-versoes-veiculo'],
    queryFn: () => crmDataClient.entities.VersaoVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const { data: modelos = [] } = useQuery({
    queryKey: ['crm-modelos-veiculo'],
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const { data: marcas = [] } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const marcaNomePorId = useMemo(() => Object.fromEntries(marcas.map((marca) => [marca.id, marca.nome])), [marcas]);
  const modeloNomePorId = useMemo(() => Object.fromEntries(modelos.map((modelo) => [modelo.id, modelo.nome])), [modelos]);

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.VersaoVeiculo.create(data),
    onMutate: () => {
      setNovoNome('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-versoes-veiculo'] });
      toast({ title: 'Versao criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a versao',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.VersaoVeiculo.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-versoes-veiculo'] });
      toast({ title: 'Versao atualizada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar a versao',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (!canConfigure) {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar versoes de veiculo.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome || !novoModeloId) return;
    createMutation.mutate({ nome, modelo_id: novoModeloId, ativo: true });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Versoes de Veiculo</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro livre (ex.: LX, Touring, ST) usado no step Veiculo dos leads. A versao amarra ao
          modelo (ex.: Civic LX, Civic Touring).
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 grid gap-3 border-b bg-white p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Modelo</Label>
          <Select value={novoModeloId} onValueChange={setNovoModeloId}>
            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
            <SelectContent className="rounded-none">
              {modelos.map((modelo) => (
                <SelectItem key={modelo.id} value={modelo.id}>
                  {marcaNomePorId[modelo.marca_id] || '-'} {modelo.nome}{!modelo.ativo ? ' (inativo)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Nova versao</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: LX"
            className="h-9 rounded-none"
          />
        </div>
        <Button
          type="submit"
          disabled={!novoNome.trim() || !novoModeloId || createMutation.isPending}
          className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
        >
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando versoes...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && versoes.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhuma versao cadastrada.</p>
      ) : null}

      {!isLoading && !error && versoes.length > 0 ? (
        <div className="overflow-hidden border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Nome</TableHead>
                <TableHead className="text-white">Modelo</TableHead>
                <TableHead className="text-white">Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versoes.map((versao) => (
                <TableRow key={versao.id}>
                  <TableCell>
                    <Input
                      defaultValue={versao.nome}
                      className="h-9 max-w-xs rounded-none"
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== versao.nome) {
                          updateMutation.mutate({
                            id: versao.id,
                            nome,
                            modelo_id: versao.modelo_id,
                            ativo: versao.ativo,
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{modeloNomePorId[versao.modelo_id] || '-'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={versao.ativo}
                      onCheckedChange={(ativo) => updateMutation.mutate({
                        id: versao.id,
                        nome: versao.nome,
                        modelo_id: versao.modelo_id,
                        ativo,
                      })}
                    />
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
    </div>
  );
}
