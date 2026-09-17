import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

export default function MarcasVeiculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [novoNome, setNovoNome] = useState('');

  const { data: marcas = [], isLoading, error } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
    enabled: user?.role === 'admin' || user?.role === 'manager',
  });

  const createMutation = useMutation({
    mutationFn: (nome) => crmDataClient.entities.MarcaVeiculo.create({ nome, ativo: true }),
    onMutate: () => {
      setNovoNome('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-marcas-veiculo'] });
      toast({ title: 'Marca criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a marca',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.MarcaVeiculo.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-marcas-veiculo'] });
      toast({ title: 'Marca atualizada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar a marca',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar marcas de veiculo.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    createMutation.mutate(nome);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Marcas de Veiculo</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro livre (ex.: Honda, Toyota, Yamaha) usado no step Veiculo dos leads. A marca nao
          define o segmento — quem amarra marca a Carro ou Moto e o cadastro de Modelos.
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 flex items-end gap-3 border-b bg-white p-5">
        <div className="flex-1 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Nova marca</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: Honda"
            className="h-9 rounded-none"
          />
        </div>
        <Button type="submit" disabled={!novoNome.trim() || createMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider">
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando marcas...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && marcas.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhuma marca cadastrada.</p>
      ) : null}

      {!isLoading && !error && marcas.length > 0 ? (
        <div className="overflow-hidden border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Nome</TableHead>
                <TableHead className="text-white">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marcas.map((marca) => (
                <TableRow key={marca.id}>
                  <TableCell>
                    <Input
                      defaultValue={marca.nome}
                      className="h-9 max-w-xs rounded-none"
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== marca.nome) {
                          updateMutation.mutate({ id: marca.id, nome, ativo: marca.ativo });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={marca.ativo}
                      onCheckedChange={(ativo) => updateMutation.mutate({ id: marca.id, nome: marca.nome, ativo })}
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
