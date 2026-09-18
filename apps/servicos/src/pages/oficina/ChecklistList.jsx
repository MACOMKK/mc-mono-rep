import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Car, History, Plus } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Badge, Spinner } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';

const STATUS_LABEL = {
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT = {
  em_andamento: 'warning',
  finalizado: 'success',
};

function AcaoCard({ icone: Icone, titulo, descricao, destaque, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-4 rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition hover:shadow-md"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
          destaque ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'
        }`}
      >
        <Icone className="h-5 w-5" />
      </span>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
    </button>
  );
}

function ChecklistThumbnail({ item }) {
  if (item.foto_thumbnail_url) {
    return (
      <img
        src={item.foto_thumbnail_url}
        alt={item.cliente_nome || 'Veículo'}
        className="h-14 w-14 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Car className="h-5 w-5" />
    </span>
  );
}

export default function ChecklistList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: recentes = [], isLoading, isError } = useQuery({
    queryKey: ['oficina', 'checklists', 'recentes'],
    queryFn: () => oficinaApi.checklists.list({ limit: 5, incluirFotos: true }),
  });

  const subtitulo = (item) =>
    [item.veiculo_placa || item.veiculo_chassi, item.veiculo_modelo, item.os ? `O.S. ${item.os}` : null, item.colaborador_nome]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        {user?.isOficinaInspetor && (
          <AcaoCard
            icone={Plus}
            titulo="Nova avaliação"
            descricao="Abrir formulário de inspeção"
            destaque
            onClick={() => navigate('/oficina/checklists/novo')}
          />
        )}
        <AcaoCard
          icone={History}
          titulo="Histórico de avaliações"
          descricao="Consultar e imprimir checklists"
          onClick={() => navigate('/oficina/checklists/historico')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Histórico recente</h2>
          <button
            type="button"
            onClick={() => navigate('/oficina/checklists/historico')}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver tudo
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Não foi possível carregar os checklists.
          </p>
        )}

        {!isLoading && !isError && (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-white">
            {recentes.map((item) => (
              <div
                key={item.id}
                className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"
                onClick={() => navigate(`/oficina/checklists/${item.id}`)}
              >
                <ChecklistThumbnail item={item} />
                <span className="w-10 shrink-0 text-sm font-semibold text-muted-foreground">Nº {item.numero}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.cliente_nome || '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">{subtitulo(item) || '—'}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.data_entrada).toLocaleDateString('pt-BR')}
                  </span>
                  <Badge variant={STATUS_VARIANT[item.status] || 'default'}>
                    {STATUS_LABEL[item.status] || item.status}
                  </Badge>
                </div>
              </div>
            ))}
            {recentes.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum checklist encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
