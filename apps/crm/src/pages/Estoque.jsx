import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

const CONDICAO_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'seminovo', label: 'Seminovo' },
  { value: 'usado', label: 'Usado' },
];

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponivel' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'vendido', label: 'Vendido' },
];

const emptyForm = {
  modelo_id: '',
  versao_id: '',
  chassi: '',
  placa: '',
  cor: '',
  km: '',
  condicao: 'novo',
  status: 'disponivel',
  preco: '',
};

export default function Estoque() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';

  const [form, setForm] = useState(emptyForm);
  const [filtros, setFiltros] = useState({ marca: '', modelo: '', versao: '', chassi: '', cor: '', placa: '' });

  const { data: veiculos = [], isLoading, error } = useQuery({
    queryKey: ['crm-veiculos-estoque'],
    queryFn: () => crmDataClient.entities.VeiculoEstoque.list('-created_date'),
  });

  const { data: modelos = [] } = useQuery({
    queryKey: ['crm-modelos-veiculo'],
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
  });

  const { data: marcas = [] } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
  });

  const { data: versoes = [] } = useQuery({
    queryKey: ['crm-versoes-veiculo'],
    queryFn: () => crmDataClient.entities.VersaoVeiculo.list('nome'),
  });

  const marcaNomePorId = useMemo(() => Object.fromEntries(marcas.map((marca) => [marca.id, marca.nome])), [marcas]);
  const modeloPorId = useMemo(() => Object.fromEntries(modelos.map((modelo) => [modelo.id, modelo])), [modelos]);
  const versaoNomePorId = useMemo(() => Object.fromEntries(versoes.map((versao) => [versao.id, versao.nome])), [versoes]);

  const versoesDoModelo = useMemo(
    () => versoes.filter((versao) => versao.modelo_id === form.modelo_id && versao.ativo),
    [versoes, form.modelo_id],
  );

  const veiculosFiltrados = useMemo(() => {
    const termo = (valor) => valor.trim().toLowerCase();
    return veiculos.filter((veiculo) => {
      const modelo = modeloPorId[veiculo.modelo_id];
      const marcaNome = modelo ? (marcaNomePorId[modelo.marca_id] || '') : '';
      const modeloNome = modelo?.nome || veiculo.modelo_outro || '';
      const versaoNome = versaoNomePorId[veiculo.versao_id] || veiculo.versao_outro || '';

      if (filtros.marca && !marcaNome.toLowerCase().includes(termo(filtros.marca))) return false;
      if (filtros.modelo && !modeloNome.toLowerCase().includes(termo(filtros.modelo))) return false;
      if (filtros.versao && !versaoNome.toLowerCase().includes(termo(filtros.versao))) return false;
      if (filtros.chassi && !veiculo.chassi.toLowerCase().includes(termo(filtros.chassi))) return false;
      if (filtros.cor && !veiculo.cor.toLowerCase().includes(termo(filtros.cor))) return false;
      if (filtros.placa && !veiculo.placa.toLowerCase().includes(termo(filtros.placa))) return false;
      return true;
    });
  }, [veiculos, filtros, modeloPorId, marcaNomePorId, versaoNomePorId]);

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.VeiculoEstoque.create(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque'] });
      setForm(emptyForm);
      toast({ title: 'Veiculo adicionado ao estoque', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel adicionar o veiculo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.VeiculoEstoque.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque'] });
      toast({ title: 'Veiculo atualizado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar o veiculo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const handleCreate = (event) => {
    event.preventDefault();
    const chassi = form.chassi.trim();
    if (!chassi || !form.modelo_id) return;
    createMutation.mutate({
      modelo_id: form.modelo_id,
      versao_id: form.versao_id || null,
      chassi,
      placa: form.placa.trim() || null,
      cor: form.cor.trim() || null,
      km: form.km ? Number(form.km) : null,
      condicao: form.condicao,
      status: form.status,
      preco: form.preco ? Number(form.preco) : null,
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Estoque</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Veiculos fisicos disponiveis para venda, identificados por chassi/placa. Reaproveita o
          catalogo de Marca / Modelo / Versao usado no cadastro de leads.
        </p>
      </div>

      {canConfigure ? (
        <form onSubmit={handleCreate} className="mb-5 grid gap-3 border-b bg-white p-5 md:grid-cols-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Modelo</Label>
            <Select
              value={form.modelo_id}
              onValueChange={(value) => setForm((prev) => ({ ...prev, modelo_id: value, versao_id: '' }))}
            >
              <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
              <SelectContent className="rounded-none">
                {modelos.map((modelo) => (
                  <SelectItem key={modelo.id} value={modelo.id}>
                    {marcaNomePorId[modelo.marca_id] || '-'} {modelo.nome}{!modelo.ativo ? ' (inativo)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Versao</Label>
            <Select
              value={form.versao_id}
              onValueChange={(value) => setForm((prev) => ({ ...prev, versao_id: value }))}
              disabled={!form.modelo_id}
            >
              <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a versao" /></SelectTrigger>
              <SelectContent className="rounded-none">
                {versoesDoModelo.map((versao) => (
                  <SelectItem key={versao.id} value={versao.id}>{versao.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Chassi</Label>
            <Input
              value={form.chassi}
              onChange={(event) => setForm((prev) => ({ ...prev, chassi: event.target.value }))}
              placeholder="Ex.: 93XATGK1WVCT33302"
              className="h-9 rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Placa</Label>
            <Input
              value={form.placa}
              onChange={(event) => setForm((prev) => ({ ...prev, placa: event.target.value }))}
              placeholder="Ex.: ABC1D23"
              className="h-9 rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Cor</Label>
            <Input
              value={form.cor}
              onChange={(event) => setForm((prev) => ({ ...prev, cor: event.target.value }))}
              placeholder="Ex.: Cinza Londrino"
              className="h-9 rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Km</Label>
            <Input
              type="number"
              min="0"
              value={form.km}
              onChange={(event) => setForm((prev) => ({ ...prev, km: event.target.value }))}
              className="h-9 rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Preco</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.preco}
              onChange={(event) => setForm((prev) => ({ ...prev, preco: event.target.value }))}
              className="h-9 rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Condicao</Label>
            <Select value={form.condicao} onValueChange={(value) => setForm((prev) => ({ ...prev, condicao: value }))}>
              <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                {CONDICAO_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider">Status</Label>
            <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end md:col-span-2">
            <Button
              type="submit"
              disabled={!form.chassi.trim() || !form.modelo_id || createMutation.isPending}
              className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
            >
              <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Adicionando...' : 'Adicionar ao estoque'}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 grid gap-3 border bg-white p-4 md:grid-cols-6">
        <Input
          value={filtros.marca}
          onChange={(event) => setFiltros((prev) => ({ ...prev, marca: event.target.value }))}
          placeholder="Marca"
          className="h-9 rounded-none"
        />
        <Input
          value={filtros.modelo}
          onChange={(event) => setFiltros((prev) => ({ ...prev, modelo: event.target.value }))}
          placeholder="Modelo"
          className="h-9 rounded-none"
        />
        <Input
          value={filtros.versao}
          onChange={(event) => setFiltros((prev) => ({ ...prev, versao: event.target.value }))}
          placeholder="Versao"
          className="h-9 rounded-none"
        />
        <Input
          value={filtros.chassi}
          onChange={(event) => setFiltros((prev) => ({ ...prev, chassi: event.target.value }))}
          placeholder="Chassi"
          className="h-9 rounded-none"
        />
        <Input
          value={filtros.cor}
          onChange={(event) => setFiltros((prev) => ({ ...prev, cor: event.target.value }))}
          placeholder="Cor"
          className="h-9 rounded-none"
        />
        <Input
          value={filtros.placa}
          onChange={(event) => setFiltros((prev) => ({ ...prev, placa: event.target.value }))}
          placeholder="Placa"
          className="h-9 rounded-none"
        />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Lista de veiculos em estoque ({veiculosFiltrados.length})
      </p>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando estoque...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && veiculosFiltrados.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhum veiculo encontrado.</p>
      ) : null}

      {!isLoading && !error && veiculosFiltrados.length > 0 ? (
        <div className="overflow-x-auto border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Marca</TableHead>
                <TableHead className="text-white">Modelo</TableHead>
                <TableHead className="text-white">Versao</TableHead>
                <TableHead className="text-white">Chassi</TableHead>
                <TableHead className="text-white">Cor</TableHead>
                <TableHead className="text-white">Placa</TableHead>
                <TableHead className="text-white">Condicao</TableHead>
                <TableHead className="text-white">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {veiculosFiltrados.map((veiculo) => {
                const modelo = modeloPorId[veiculo.modelo_id];
                return (
                  <TableRow key={veiculo.id}>
                    <TableCell className="text-sm text-slate-700">{modelo ? (marcaNomePorId[modelo.marca_id] || '-') : '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{modelo?.nome || veiculo.modelo_outro || '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{versaoNomePorId[veiculo.versao_id] || veiculo.versao_outro || '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{veiculo.chassi}</TableCell>
                    <TableCell className="text-sm text-slate-700">{veiculo.cor || '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{veiculo.placa || '-'}</TableCell>
                    <TableCell>
                      {canConfigure ? (
                        <Select
                          value={veiculo.condicao}
                          onValueChange={(condicao) => updateMutation.mutate({ id: veiculo.id, ...veiculo, condicao })}
                        >
                          <SelectTrigger className="h-8 w-28 rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-none">
                            {CONDICAO_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-slate-700">{CONDICAO_OPTIONS.find((option) => option.value === veiculo.condicao)?.label || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canConfigure ? (
                        <Select
                          value={veiculo.status}
                          onValueChange={(status) => updateMutation.mutate({ id: veiculo.id, ...veiculo, status })}
                        >
                          <SelectTrigger className="h-8 w-28 rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-none">
                            {STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-slate-700">{STATUS_OPTIONS.find((option) => option.value === veiculo.status)?.label || '-'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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
