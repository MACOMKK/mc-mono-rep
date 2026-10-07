import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Pencil, Trash2 } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Badge, Button, CarLoader, Dialog, DialogContent, DialogHeader, DialogTitle, Sheet, SheetContent, SheetHeader, SheetTitle, useToast } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import { formatDocumento, formatTelefone } from '@/lib/oficinaFormat';
import { ORIGEM_CADASTRO_LABEL } from '@/lib/origemCadastro';
import ChecklistRow from '@/components/oficina/ChecklistRow';
import { ClienteForm } from '@/components/oficina/ClienteVeiculoPicker';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';

function Campo({ label, children }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{children || '—'}</p>
    </div>
  );
}

export default function ClienteDetalheSheet({ clienteId, onOpenChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editarAberto, setEditarAberto] = useState(false);
  const [excluirAberto, setExcluirAberto] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['oficina', 'cliente', clienteId],
    queryFn: () => oficinaApi.clientes.obter(clienteId),
    enabled: Boolean(clienteId),
  });

  const cliente = data?.cliente;
  const veiculos = data?.veiculos || [];
  const checklists = data?.checklists || [];
  const temVinculos = veiculos.length > 0 || checklists.length > 0;

  const handleExcluir = (event) => {
    // otimista: fecha o diálogo, o sheet e remove da lista na hora, sem esperar o servidor.
    // O botão só fica habilitado quando não há vínculos (veja `temVinculos` acima), e o
    // backend também valida antes de excluir — então o erro aqui é caso raro (corrida com
    // outro vínculo criado entre o carregamento e o clique); se acontecer, só avisa via toast.
    event?.preventDefault();
    setExcluirAberto(false);
    onOpenChange(false);
    const listaKey = ['oficina', 'clientes'];
    const anterior = queryClient.getQueryData(listaKey);
    queryClient.setQueryData(listaKey, (old = []) => old.filter((item) => item.id !== clienteId));
    oficinaApi.clientes
      .excluir(clienteId)
      .catch((error) => {
        queryClient.setQueryData(listaKey, anterior);
        toast({
          title: 'Não foi possível excluir o cliente',
          description: error.message || 'Tente novamente.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: listaKey });
      });
  };

  return (
    <Sheet open={Boolean(clienteId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detalhe do cliente</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-6">
          {isLoading && <CarLoader inline />}

          {isError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Não foi possível carregar o cliente.
            </p>
          )}

          {!isLoading && !isError && cliente && (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold uppercase">{cliente.nome}</p>
                    {cliente.eh_teste && <Badge variant="outline">Teste</Badge>}
                    {ORIGEM_CADASTRO_LABEL[cliente.origem_cadastro] && (
                      <Badge variant="outline">{ORIGEM_CADASTRO_LABEL[cliente.origem_cadastro]}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {user?.isOficinaInspetor && (
                      <Button variant="outline" size="sm" onClick={() => setEditarAberto(true)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                    )}
                    {user?.isOficinaAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={temVinculos}
                        title={temVinculos ? 'Cliente com vínculos não pode ser excluído' : 'Excluir cliente'}
                        onClick={() => setExcluirAberto(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Telefone">{formatTelefone(cliente.telefone)}</Campo>
                  <Campo label="CPF/CNPJ">{formatDocumento(cliente.cpf_cnpj)}</Campo>
                </div>
                <Campo label="E-mail">{cliente.email}</Campo>
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">Veículos</h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                  {veiculos.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Car className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {[item.marca_nome, item.modelo_nome].filter(Boolean).join(' ') || '—'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[item.placa, item.chassi, item.cor].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {veiculos.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">Nenhum veículo em nome deste cliente.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">Checklists</h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                  {checklists.map((item) => (
                    <ChecklistRow key={item.id} item={item} onClick={() => navigate(`/oficina/checklists/${item.id}`)} />
                  ))}
                  {checklists.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">Nenhum checklist para este cliente ainda.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>

      <Dialog open={editarAberto} onOpenChange={setEditarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Este cadastro é compartilhado com o CRM: a alteração vale para os dois sistemas.
          </p>
          {cliente && (
            <ClienteForm
              inicial={cliente}
              onCriado={() => {
                setEditarAberto(false);
                queryClient.invalidateQueries({ queryKey: ['oficina', 'cliente', clienteId] });
                queryClient.invalidateQueries({ queryKey: ['oficina', 'clientes'] });
              }}
              onCancelar={() => setEditarAberto(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={excluirAberto}
        onOpenChange={setExcluirAberto}
        onConfirm={handleExcluir}
        title="Excluir cliente"
        description={`Excluir definitivamente o cliente "${cliente?.nome || ''}"? Só é possível se não houver veículos, checklists ou cadastro no CRM vinculados. Não pode ser desfeito.`}
      />
    </Sheet>
  );
}
