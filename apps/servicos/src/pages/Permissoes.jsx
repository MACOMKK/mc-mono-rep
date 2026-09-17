import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  ProfileViewDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@macom/ui';

import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';
import { normalize } from '@/lib/normalize';
import { MODULOS_PERMISSAO, PAPEIS_MODULO_FINANCEIRO } from '@/lib/modulosPermissao';

const MODULOS_ATIVOS = MODULOS_PERMISSAO.filter((modulo) => modulo.ativo);

// colaborador_id -> { [modulo]: papel }
function indexByColaborador(permissoes) {
  const index = {};
  for (const item of permissoes) {
    if (!index[item.colaborador_id]) index[item.colaborador_id] = {};
    index[item.colaborador_id][item.modulo] = item.papel;
  }
  return index;
}

const PAPEL_FILTRO_TODOS = 'todos';

export default function Permissoes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [papelFiltro, setPapelFiltro] = useState(PAPEL_FILTRO_TODOS);
  const [perfilColaboradorId, setPerfilColaboradorId] = useState(null);

  const permissoesQuery = useQuery({
    queryKey: ['servicos', 'permissoes'],
    queryFn: () => financeiroApi.permissoes.list(),
  });
  const colaboradores = permissoesQuery.data?.colaboradores || [];
  const permissoesPorColaborador = useMemo(
    () => indexByColaborador(permissoesQuery.data?.permissoes || []),
    [permissoesQuery.data],
  );
  const loading = permissoesQuery.isLoading;

  function papelDe(colaboradorId, modulo) {
    return permissoesPorColaborador[colaboradorId]?.[modulo] || 'usuario';
  }

  const filteredColaboradores = colaboradores.filter((colaborador) => {
    const termo = normalize(busca);
    if (termo && ![colaborador.nome, colaborador.email].some((value) => normalize(value).includes(termo))) {
      return false;
    }
    if (papelFiltro !== PAPEL_FILTRO_TODOS) {
      const papelEfetivo = colaborador.system_access_level === 'admin' ? 'financeiro' : papelDe(colaborador.colaborador_id, 'financeiro');
      if (papelEfetivo !== papelFiltro) return false;
    }
    return true;
  });
  const { page, setPage, pageItems, total } = usePagination(filteredColaboradores, 10);

  const alterarMutation = useMutation({
    mutationFn: ({ colaboradorId, modulo, papel }) => financeiroApi.permissoes.set(colaboradorId, modulo, papel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'permissoes'] });
      toast({ title: 'Permissão atualizada' });
    },
    onError: (error) => toast({ title: 'Não foi possível atualizar a permissão', description: error.message }),
  });

  function handleChange(colaboradorId, modulo, papel) {
    alterarMutation.mutate({ colaboradorId, modulo, papel });
  }

  const isSaving = (colaboradorId, modulo) =>
    alterarMutation.isPending &&
    alterarMutation.variables?.colaboradorId === colaboradorId &&
    alterarMutation.variables?.modulo === modulo;

  const modulosEmBreve = useMemo(() => MODULOS_PERMISSAO.filter((modulo) => !modulo.ativo), []);
  // Cabecalho precisa seguir a MESMA ordem das celulas do corpo (ativos primeiro, depois em breve --
  // ver MODULOS_ATIVOS.map/modulosEmBreve.map abaixo), senao o header desalinha das colunas reais.
  const modulosColunas = useMemo(() => [...MODULOS_ATIVOS, ...modulosEmBreve], [modulosEmBreve]);

  const perfilQuery = useQuery({
    queryKey: ['servicos', 'colaborador-profile', perfilColaboradorId],
    queryFn: () => financeiroApi.colaboradores.getProfile(perfilColaboradorId),
    enabled: Boolean(perfilColaboradorId),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Permissões por módulo</h2>
        <p className="text-sm text-muted-foreground">
          Papel de cada colaborador por módulo. Acesso &quot;Admin&quot; ao sistema já dá papel
          máximo em todos.
          {modulosEmBreve.length > 0 && <> Colunas em cinza ainda não têm tela real.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar..." className="max-w-sm" />
        <Select value={papelFiltro} onValueChange={setPapelFiltro}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Nível de acesso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PAPEL_FILTRO_TODOS}>Todos os níveis</SelectItem>
            {PAPEIS_MODULO_FINANCEIRO.map((papel) => (
              <SelectItem key={papel.value} value={papel.value}>
                {papel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Carregando...
        </div>
      ) : filteredColaboradores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {colaboradores.length === 0
            ? 'Nenhum colaborador com acesso ao Serviços.'
            : 'Nenhum colaborador corresponde à pesquisa/filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Acesso ao sistema</TableHead>
                {modulosColunas.map((modulo) => (
                  <TableHead key={modulo.key} className={modulo.ativo ? undefined : 'text-muted-foreground'}>
                    {modulo.label}
                    {!modulo.ativo && (
                      <span className="ml-1 text-[10px] font-normal uppercase tracking-wide">(em breve)</span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((colaborador) => {
                const isSystemAdmin = colaborador.system_access_level === 'admin';
                return (
                  <TableRow key={colaborador.colaborador_id}>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => setPerfilColaboradorId(colaborador.colaborador_id)}
                      >
                        {colaborador.nome}
                      </button>
                      <div className="text-xs text-muted-foreground">{colaborador.email}</div>
                    </TableCell>
                    <TableCell className="capitalize">{colaborador.system_access_level}</TableCell>
                    {MODULOS_ATIVOS.map((modulo) => (
                      <TableCell key={modulo.key} className="max-w-[220px]">
                        {isSystemAdmin ? (
                          <span className="text-xs text-muted-foreground">Acesso total</span>
                        ) : (
                          <Select
                            value={papelDe(colaborador.colaborador_id, modulo.key)}
                            disabled={isSaving(colaborador.colaborador_id, modulo.key)}
                            onValueChange={(value) => handleChange(colaborador.colaborador_id, modulo.key, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {modulo.papeis.map((papel) => (
                                <SelectItem key={papel.value} value={papel.value}>
                                  {papel.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    ))}
                    {modulosEmBreve.map((modulo) => (
                      <TableCell key={modulo.key} className="text-xs text-muted-foreground">
                        —
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filteredColaboradores.length > 0 && (
        <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} itemLabel="colaborador(es)" />
      )}

      <ProfileViewDialog
        open={Boolean(perfilColaboradorId)}
        onOpenChange={(open) => !open && setPerfilColaboradorId(null)}
        profile={perfilQuery.data}
        loading={perfilQuery.isLoading}
        error={perfilQuery.error}
      />
    </div>
  );
}
