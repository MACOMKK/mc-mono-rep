import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Car, Plus } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Badge, Button, CarLoader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';

const STATUS_LABEL = {
  em_andamento: 'Em andamento',
  avaliado: 'Avaliado',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT = {
  em_andamento: 'warning',
  avaliado: 'default',
  finalizado: 'success',
};

const FILTRO_TODOS = 'todas';

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

export default function ChecklistHistorico() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [unidadeFiltro, setUnidadeFiltro] = useState(FILTRO_TODOS);

  const unidadeFiltroAtiva = user?.isOficinaGestor && unidadeFiltro !== FILTRO_TODOS ? unidadeFiltro : undefined;

  const { data: checklists = [], isLoading, isError } = useQuery({
    queryKey: ['oficina', 'checklists', 'historico', unidadeFiltroAtiva],
    queryFn: () => oficinaApi.checklists.list({ incluirFotos: true, unidadeId: unidadeFiltroAtiva }),
  });

  // Lista completa (sem filtro de unidade) so para popular as opcoes do
  // dropdown -- so gestor/admin enxergam todas as unidades mesmo.
  const { data: checklistsTodos = [] } = useQuery({
    queryKey: ['oficina', 'checklists', 'historico', 'todas-unidades'],
    queryFn: () => oficinaApi.checklists.list({}),
    enabled: Boolean(user?.isOficinaGestor),
    staleTime: 5 * 60 * 1000,
  });

  const subtitulo = (item) =>
    [
      item.veiculo_placa || item.veiculo_chassi,
      item.veiculo_modelo,
      item.os ? `O.S. ${item.os}` : null,
      item.colaborador_nome,
      item.unidade_nome,
    ]
      .filter(Boolean)
      .join(' · ');

  const unidades = useMemo(() => {
    const mapa = new Map();
    checklistsTodos.forEach((item) => {
      if (item.unidade_id && item.unidade_nome && !mapa.has(item.unidade_id)) {
        mapa.set(item.unidade_id, item.unidade_nome);
      }
    });
    return Array.from(mapa.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [checklistsTodos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return checklists;
    return checklists.filter((item) =>
      [item.cliente_nome, item.veiculo_placa, item.veiculo_chassi, item.colaborador_nome]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [checklists, busca]);

  const { page, setPage, pageItems, total, pageSize } = usePagination(filtrados, 15);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oficina/checklists')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Histórico de avaliações</h1>
            <p className="text-sm text-muted-foreground">Vistorias de veículos realizadas na oficina.</p>
          </div>
        </div>
        {user?.isOficinaInspetor && (
          <Button onClick={() => navigate('/oficina/checklists/novo')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por cliente, placa ou chassi..." className="md:max-w-sm" />
        {user?.isOficinaGestor && (
          <div className="w-full sm:w-48">
            <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas unidades</SelectItem>
                {unidades.map((unidade) => (
                  <SelectItem key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading && <CarLoader inline />}

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os checklists.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {pageItems.map((item) => (
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
            {pageItems.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum checklist encontrado.</p>
            )}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="checklist(s)" />
        </>
      )}
    </div>
  );
}
