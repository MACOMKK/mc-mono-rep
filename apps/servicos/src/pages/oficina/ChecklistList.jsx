import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, History, Plus, Search } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { CarLoader } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import ChecklistRow from '@/components/oficina/ChecklistRow';

function AcaoCard({ icone: Icone, titulo, descricao, destaque, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:shadow-md"
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

export default function ChecklistList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: recentes = [], isLoading, isError } = useQuery({
    queryKey: ['oficina', 'checklists', 'recentes'],
    queryFn: () => oficinaApi.checklists.list({ limit: 5, incluirFotos: true }),
  });

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
        <AcaoCard
          icone={Search}
          titulo="Veículos cadastrados"
          descricao="Ver ou cadastrar sem abrir um checklist"
          onClick={() => navigate('/oficina/veiculos')}
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

        {isLoading && <CarLoader inline />}

        {isError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Não foi possível carregar os checklists.
          </p>
        )}

        {!isLoading && !isError && (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {recentes.map((item) => (
              <ChecklistRow key={item.id} item={item} onClick={() => navigate(`/oficina/checklists/${item.id}`)} />
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
