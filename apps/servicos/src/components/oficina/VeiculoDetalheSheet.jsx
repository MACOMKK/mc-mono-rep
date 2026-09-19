import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Car } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { CarLoader, Sheet, SheetContent, SheetHeader, SheetTitle } from '@macom/ui';
import ChecklistRow from '@/components/oficina/ChecklistRow';

function formatarPeriodo(desde, ate) {
  const inicio = new Date(desde).toLocaleDateString('pt-BR');
  if (!ate) return `Desde ${inicio}`;
  const fim = new Date(ate).toLocaleDateString('pt-BR');
  return `${inicio} — ${fim}`;
}

export default function VeiculoDetalheSheet({ veiculoId, onOpenChange }) {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['oficina', 'veiculo', veiculoId],
    queryFn: () => oficinaApi.veiculos.obter(veiculoId),
    enabled: Boolean(veiculoId),
  });

  const veiculo = data?.veiculo;
  const proprietarios = data?.proprietarios || [];
  const checklists = data?.checklists || [];

  return (
    <Sheet open={Boolean(veiculoId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detalhe do veículo</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-6">
          {isLoading && <CarLoader inline />}

          {isError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Não foi possível carregar o veículo.
            </p>
          )}

          {!isLoading && !isError && veiculo && (
            <>
              <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Car className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {[veiculo.marca_nome, veiculo.modelo_nome].filter(Boolean).join(' ') || '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[veiculo.placa, veiculo.chassi, veiculo.cor].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {checklists[0]
                      ? `Última km registrada: ${checklists[0].km ?? '—'} (em ${new Date(checklists[0].data_entrada).toLocaleDateString('pt-BR')})`
                      : 'Última km registrada: — (sem checklists ainda)'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Dono atual</p>
                <p className="text-sm font-medium">{veiculo.cliente_atual_nome || '—'}</p>
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">Histórico de proprietários</h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                  {proprietarios.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 text-sm">
                      <span className="font-medium">{item.cliente_nome || '—'}</span>
                      <span className="text-xs text-muted-foreground">{formatarPeriodo(item.desde, item.ate)}</span>
                    </div>
                  ))}
                  {proprietarios.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">Nenhum proprietário registrado.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">Checklists deste veículo</h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                  {checklists.map((item) => (
                    <ChecklistRow key={item.id} item={item} onClick={() => navigate(`/oficina/checklists/${item.id}`)} />
                  ))}
                  {checklists.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      Nenhum checklist registrado para este veículo ainda.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
