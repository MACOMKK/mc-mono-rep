import { useState } from 'react';
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
import { LEAD_STATUS_LABEL } from '@/lib/leadStatus';

const STATUSES_ANDAMENTO = ['qualificado', 'convertido'];

export default function MotivosAndamento() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [novoNome, setNovoNome] = useState('');
  const [novoStatus, setNovoStatus] = useState(STATUSES_ANDAMENTO[0]);

  const { data: motivos = [], isLoading, error } = useQuery({
    queryKey: ['crm-motivos-status'],
    queryFn: () => crmDataClient.entities.MotivoStatus.list('nome'),
    enabled: user?.role === 'admin' || user?.role === 'manager',
    select: (rows) => rows.filter((row) => STATUSES_ANDAMENTO.includes(row.status)),
  });

  const createMutation = useMutation({
    mutationFn: ({ status, nome }) => crmDataClient.entities.MotivoStatus.create({ status, nome, ativo: true }),
    onMutate: () => {
      setNovoNome('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-motivos-status'] });
      toast({ title: 'Motivo criado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar o motivo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.MotivoStatus.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-motivos-status'] });
      toast({ title: 'Motivo atualizado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar o motivo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar motivos de andamento.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    createMutation.mutate({ status: novoStatus, nome });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Motivos de Andamento</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro dos motivos exigidos para avancar um lead para Qualificado ou Convertido.
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 flex items-end gap-3 border-b bg-white p-5">
        <div className="w-48 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Status</Label>
          <Select value={novoStatus} onValueChange={setNovoStatus}>
            <SelectTrigger className="h-9 rounded-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES_ANDAMENTO.map((status) => (
                <SelectItem key={status} value={status}>{LEAD_STATUS_LABEL[status]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Novo motivo</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: Orcamento aprovado"
            className="h-9 rounded-none"
          />
        </div>
        <Button type="submit" disabled={!novoNome.trim() || createMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider">
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando motivos...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}

      {STATUSES_ANDAMENTO.map((status) => {
        const motivosDoStatus = motivos.filter((motivo) => motivo.status === status);
        if (isLoading || error) return null;
        return (
          <div key={status} className="mb-6">
            <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{LEAD_STATUS_LABEL[status]}</h2>
            {motivosDoStatus.length === 0 ? (
              <p className="border bg-white py-6 text-center text-sm text-muted-foreground">Nenhum motivo cadastrado.</p>
            ) : (
              <div className="overflow-hidden border bg-white">
                <Table>
                  <TableHeader className="bg-[#1a1a1a]">
                    <TableRow>
                      <TableHead className="text-white">Nome</TableHead>
                      <TableHead className="text-white">Ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motivosDoStatus.map((motivo) => (
                      <TableRow key={motivo.id}>
                        <TableCell>
                          <Input
                            defaultValue={motivo.nome}
                            className="h-9 max-w-xs rounded-none"
                            onBlur={(event) => {
                              const nome = event.target.value.trim();
                              if (nome && nome !== motivo.nome) {
                                updateMutation.mutate({ id: motivo.id, status: motivo.status, nome, ativo: motivo.ativo });
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={motivo.ativo}
                            onCheckedChange={(ativo) => updateMutation.mutate({ id: motivo.id, status: motivo.status, nome: motivo.nome, ativo })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}

      {updateMutation.isPending ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Save className="h-3.5 w-3.5" /> Salvando...
        </div>
      ) : null}
    </div>
  );
}
