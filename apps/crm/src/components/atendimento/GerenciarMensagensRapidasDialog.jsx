import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Cadastro de equipe (sem unidade_id/posse, ver migration) -- qualquer atendente pode criar,
// editar ou excluir qualquer mensagem rapida, nao so a que ele mesmo criou. Lista aqui e o
// dropdown de "Respostas rapidas" do composer leem a mesma query key ('crm-mensagens-rapidas'),
// entao salvar aqui atualiza o dropdown sem precisar fechar/reabrir nada.
export default function GerenciarMensagensRapidasDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoTexto, setNovoTexto] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editTexto, setEditTexto] = useState('');

  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ['crm-mensagens-rapidas'],
    queryFn: () => crmDataClient.entities.MensagemRapida.list('titulo', 500),
    enabled: open,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['crm-mensagens-rapidas'] });

  const createMutation = useMutation({
    mutationFn: ({ titulo, texto }) => crmDataClient.entities.MensagemRapida.create({ titulo, texto }),
    onSuccess: () => {
      setNovoTitulo('');
      setNovoTexto('');
      invalidar();
    },
    onError: (error) => toast({
      title: 'Não foi possível criar a mensagem rápida',
      description: error.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, titulo, texto }) => crmDataClient.entities.MensagemRapida.update(id, { titulo, texto }),
    onSuccess: () => {
      setEditandoId(null);
      invalidar();
    },
    onError: (error) => toast({
      title: 'Não foi possível salvar a mensagem rápida',
      description: error.message,
      variant: 'destructive',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.MensagemRapida.delete(id),
    onSuccess: invalidar,
    onError: (error) => toast({
      title: 'Não foi possível excluir a mensagem rápida',
      description: error.message,
      variant: 'destructive',
    }),
  });

  const handleCreate = (event) => {
    event.preventDefault();
    const titulo = novoTitulo.trim();
    const texto = novoTexto.trim();
    if (!titulo || !texto) return;
    createMutation.mutate({ titulo, texto });
  };

  const iniciarEdicao = (mensagem) => {
    setEditandoId(mensagem.id);
    setEditTitulo(mensagem.titulo);
    setEditTexto(mensagem.texto);
  };

  const salvarEdicao = () => {
    const titulo = editTitulo.trim();
    const texto = editTexto.trim();
    if (!titulo || !texto) return;
    updateMutation.mutate({ id: editandoId, titulo, texto });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Mensagens rápidas</DialogTitle>
          <DialogDescription>
            Cadastre respostas prontas para usar no chat de Atendimento (botão de raio no composer).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex flex-col gap-2 border-b border-border pb-4">
          <Input
            value={novoTitulo}
            onChange={(event) => setNovoTitulo(event.target.value)}
            placeholder="Título (ex.: Saudação)"
          />
          <Textarea
            value={novoTexto}
            onChange={(event) => setNovoTexto(event.target.value)}
            placeholder="Texto da mensagem..."
            rows={2}
            className="resize-none"
          />
          <Button
            type="submit"
            size="sm"
            className="self-end"
            disabled={!novoTitulo.trim() || !novoTexto.trim() || createMutation.isPending}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar
          </Button>
        </form>

        <div className="flex flex-col gap-2 overflow-y-auto pt-2">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
          {!isLoading && mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem rápida cadastrada.</p>
          ) : null}
          {mensagens.map((mensagem) => (
            editandoId === mensagem.id ? (
              <div key={mensagem.id} className="flex flex-col gap-2 rounded-md border border-primary p-2">
                <Input value={editTitulo} onChange={(event) => setEditTitulo(event.target.value)} />
                <Textarea
                  value={editTexto}
                  onChange={(event) => setEditTexto(event.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditandoId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editTitulo.trim() || !editTexto.trim() || updateMutation.isPending}
                    onClick={salvarEdicao}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div key={mensagem.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{mensagem.titulo}</p>
                  <p className="text-xs text-muted-foreground">{mensagem.texto}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Editar"
                    onClick={() => iniciarEdicao(mensagem)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label="Excluir"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(mensagem.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
