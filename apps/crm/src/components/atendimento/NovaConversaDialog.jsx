import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Phone, User, UserPlus } from 'lucide-react';
import { atendimentoApi } from '@/api/atendimentoApi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function formatarTelefone(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  const nacional = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return telefone || '';
}

// Numero "discavel": 10/11 digitos (DDD + numero) ou 12-13 com DDI. Mesma faixa aceita pelo
// crm-api (normalizeTelefoneDigitado em supabase/functions/_shared/phone.ts).
function telefoneValido(texto) {
  const digits = String(texto || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export default function NovaConversaDialog({ open, onOpenChange, onIniciar, isPending }) {
  const [busca, setBusca] = useState('');
  const termo = useDebouncedValue(busca, 300).trim();

  useEffect(() => {
    if (!open) setBusca('');
  }, [open]);

  const { data: contatos = [], isFetching } = useQuery({
    queryKey: ['atendimento-buscar-contatos', termo],
    queryFn: () => atendimentoApi.buscarContatos(termo),
    enabled: open && termo.length >= 2,
    staleTime: 30000,
  });

  const podeUsarNumero = telefoneValido(busca);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            Busque um lead ou cliente, ou digite um número com DDD.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Nome ou telefone, ex.: (91) 98888-7777"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && podeUsarNumero && !isPending) {
              event.preventDefault();
              onIniciar({ telefone: busca });
            }
          }}
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {podeUsarNumero ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onIniciar({ telefone: busca })}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Conversar com <strong>{formatarTelefone(busca)}</strong>
              </span>
            </button>
          ) : null}

          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando contatos...
            </div>
          ) : null}

          {contatos.map((contato) => (
            <button
              key={`${contato.tipo}-${contato.id}`}
              type="button"
              disabled={isPending || !contato.telefone}
              onClick={() =>
                onIniciar(contato.tipo === 'lead' ? { leadId: contato.id } : { clienteId: contato.id })
              }
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
            >
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{contato.nome}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {contato.telefone ? formatarTelefone(contato.telefone) : 'Sem telefone'}
                </div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                {contato.tipo}
              </span>
            </button>
          ))}

          {!isFetching && termo.length >= 2 && contatos.length === 0 && !podeUsarNumero ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum lead ou cliente encontrado.</p>
          ) : null}
        </div>

        {isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Abrindo conversa...
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
