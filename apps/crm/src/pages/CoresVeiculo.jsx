import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

export default function CoresVeiculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';
  const [novoNome, setNovoNome] = useState('');

  const { data: cores = [], isLoading, error } = useQuery({
    queryKey: ['crm-cores-veiculo'],
    queryFn: () => crmDataClient.entities.CorVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.CorVeiculo.create(data),
    onMutate: () => {
      setNovoNome('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-cores-veiculo'] });
      toast({ title: 'Cor criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a cor',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.CorVeiculo.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-cores-veiculo'] });
      toast({ title: 'Cor atualizada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar a cor',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.CorVeiculo.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-cores-veiculo'] });
      toast({ title: 'Cor excluida', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel excluir a cor',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (!canConfigure) {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar cores de veiculo.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    createMutation.mutate({ nome });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Cores de Veiculo</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro livre de cores usado no cadastro de veiculos em estoque.
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 grid gap-3 border-b bg-white p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Nova cor</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: Prata"
            className="h-9 rounded-none"
          />
        </div>
        <Button
          type="submit"
          disabled={!novoNome.trim() || createMutation.isPending}
          className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
        >
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando cores...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && cores.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhuma cor cadastrada.</p>
      ) : null}

      {!isLoading && !error && cores.length > 0 ? (
        <div className="overflow-hidden border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Nome</TableHead>
                <TableHead className="text-white" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cores.map((cor) => (
                <TableRow key={cor.id}>
                  <TableCell>
                    <Input
                      defaultValue={cor.nome}
                      className="h-9 max-w-xs rounded-none"
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== cor.nome) {
                          updateMutation.mutate({ id: cor.id, nome });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-none text-red-600"
                      onClick={() => {
                        if (window.confirm(`Excluir a cor "${cor.nome}"?`)) {
                          deleteMutation.mutate(cor.id);
                        }
                      }}
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
    </div>
  );
}
