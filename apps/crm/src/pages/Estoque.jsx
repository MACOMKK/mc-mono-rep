import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Pencil, Plus, RotateCcw, Save, Search, Star, Trash2, X } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import ListPagination from '@/components/ListPagination';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

// teste: Ignored Build Step Vercel (isolar deploys por app)
const emptyNovoModelo = { nome: '', marca_id: '', categoria_veiculo_id: '', ano_inicio: '', ano_fim: '' };

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

const ABAS_CONDICAO = [
  { value: 'todos', label: 'Todos' },
  { value: 'novo', label: 'Novos' },
  { value: 'seminovo', label: 'Seminovos' },
];

const SITUACAO_OPTIONS = [
  { value: 'estoque', label: 'Estoque' },
  { value: 'saida_demonstracao', label: 'Saida demonstracao' },
  { value: 'imobilizado', label: 'Imobilizado' },
];

const SITUACAO_BADGE_CLASS = {
  estoque: 'bg-emerald-100 text-emerald-700',
  saida_demonstracao: 'bg-amber-100 text-amber-700',
  imobilizado: 'bg-slate-200 text-slate-700',
};

const emptyForm = {
  modelo_id: '',
  versao_id: '',
  chassi: '',
  placa: '',
  cor_id: '',
  km: '',
  condicao: 'novo',
  status: 'disponivel',
  preco: '',
  situacao: 'estoque',
  vendedor_reserva_id: '',
  cliente_reserva_id: '',
  cliente_reserva_nome: '',
};

function ClienteReservaField({ value, nome, onSelect, onClear }) {
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebouncedValue(busca);
  const [resultados, setResultados] = useState([]);

  useEffect(() => {
    if (!buscaDebounced.trim()) {
      setResultados([]);
      return undefined;
    }
    let cancelado = false;
    crmDataClient.entities.Cliente.buscar(buscaDebounced)
      .then((rows) => { if (!cancelado) setResultados(rows || []); })
      .catch(() => { if (!cancelado) setResultados([]); });
    return () => { cancelado = true; };
  }, [buscaDebounced]);

  if (value && nome) {
    return (
      <div className="flex items-center justify-between gap-2 border px-3 py-2 text-sm">
        <span>{nome}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Nome, telefone ou CPF/CNPJ..."
          className="h-9 rounded-none pl-8"
        />
      </div>
      {resultados.length > 0 ? (
        <div className="max-h-40 divide-y overflow-y-auto border">
          {resultados.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full p-2 text-left text-sm hover:bg-accent"
              onClick={() => { onSelect(item); setBusca(''); setResultados([]); }}
            >
              {item.nome}{item.telefone ? ` - ${item.telefone}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Estoque() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';

  const [form, setForm] = useState(emptyForm);
  const [filtros, setFiltros] = useState({
    marca: '', modelo: '', chassi: '', placa: '', cor: '', km: '', preco: '', condicao: '', status: '',
  });
  const [abaCondicao, setAbaCondicao] = useState('todos');
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebouncedValue(busca);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [modeloDialogOpen, setModeloDialogOpen] = useState(false);
  const [novoModelo, setNovoModelo] = useState(emptyNovoModelo);
  const [versaoDialogOpen, setVersaoDialogOpen] = useState(false);
  const [novaVersaoNome, setNovaVersaoNome] = useState('');
  const [corDialogOpen, setCorDialogOpen] = useState(false);
  const [novaCorNome, setNovaCorNome] = useState('');
  const [veiculoParaExcluir, setVeiculoParaExcluir] = useState(null);
  const [novoVeiculoDialogOpen, setNovoVeiculoDialogOpen] = useState(false);
  const [reservaDialogVeiculo, setReservaDialogVeiculo] = useState(null);
  const [reservaForm, setReservaForm] = useState({ vendedor_reserva_id: '', cliente_reserva_id: '', cliente_reserva_nome: '' });

  // Aba (Todos/Novos/Seminovos) e o dropdown de condicao sao filtros independentes que ja
  // eram combinados em AND no filtro client-side antigo -- a intersecao dos dois conjuntos
  // decide se manda condicao como igualdade, IN ou nenhum filtro (quando cobre as 3 opcoes).
  const condicoesPermitidas = useMemo(() => {
    const todas = CONDICAO_OPTIONS.map((option) => option.value);
    const daAba = abaCondicao === 'novo' ? ['novo'] : abaCondicao === 'seminovo' ? ['seminovo', 'usado'] : todas;
    const doDropdown = filtros.condicao ? [filtros.condicao] : todas;
    return daAba.filter((value) => doDropdown.includes(value));
  }, [abaCondicao, filtros.condicao]);
  const condicaoFilter = useMemo(() => {
    const todas = CONDICAO_OPTIONS.map((option) => option.value);
    if (condicoesPermitidas.length === 0 || condicoesPermitidas.length === todas.length) return undefined;
    return condicoesPermitidas.length === 1 ? condicoesPermitidas[0] : condicoesPermitidas;
  }, [condicoesPermitidas]);

  const serverFilters = useMemo(() => ({
    ...(condicaoFilter !== undefined ? { condicao: condicaoFilter } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.marca ? { marca: filtros.marca } : {}),
    ...(filtros.modelo ? { modelo: filtros.modelo } : {}),
    ...(filtros.chassi ? { chassi: filtros.chassi } : {}),
    ...(filtros.placa ? { placa: filtros.placa } : {}),
    ...(filtros.cor ? { cor: filtros.cor } : {}),
    ...(filtros.km ? { km_max: filtros.km } : {}),
    ...(filtros.preco ? { preco_max: filtros.preco } : {}),
  }), [condicaoFilter, filtros.status, filtros.marca, filtros.modelo, filtros.chassi, filtros.placa, filtros.cor, filtros.km, filtros.preco]);

  useEffect(() => {
    setPage(1);
  }, [serverFilters, buscaDebounced]);

  const veiculosQueryKey = ['crm-veiculos-estoque', { filters: serverFilters, busca: buscaDebounced, page, pageSize }];
  const { data: veiculosPage = { rows: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: veiculosQueryKey,
    queryFn: () => crmDataClient.entities.VeiculoEstoque.listPage({
      orderBy: '-created_date',
      page,
      limit: pageSize,
      filters: serverFilters,
      search: buscaDebounced,
    }),
  });
  const veiculos = veiculosPage.rows;
  const totalPages = Math.max(1, Math.ceil((veiculosPage.count || 0) / pageSize));

  // Resumo (cards de total/novos/seminovos) precisa do total real, nao so da pagina atual --
  // reaproveita o mesmo filtro+busca da lista, so troca o limit por 1 e pede so a contagem.
  // "novos" refaz a contagem forcando condicao=novo (ignorando a aba/dropdown de condicao,
  // que ja fica implicito no proprio numero); "seminovos" e a diferenca.
  const { data: totalGeral = 0 } = useQuery({
    queryKey: ['crm-veiculos-estoque-count', { filters: serverFilters, busca: buscaDebounced }],
    queryFn: () => crmDataClient.entities.VeiculoEstoque.listPage({
      limit: 1,
      filters: serverFilters,
      search: buscaDebounced,
    }).then((result) => result.count || 0),
  });
  const novosPossivel = condicoesPermitidas.includes('novo');
  const { data: totalNovos = 0 } = useQuery({
    queryKey: ['crm-veiculos-estoque-count-novos', { filters: serverFilters, busca: buscaDebounced }],
    enabled: novosPossivel,
    queryFn: () => crmDataClient.entities.VeiculoEstoque.listPage({
      limit: 1,
      filters: { ...serverFilters, condicao: 'novo' },
      search: buscaDebounced,
    }).then((result) => result.count || 0),
  });
  const resumoEstoque = {
    total: totalGeral,
    novos: novosPossivel ? totalNovos : 0,
    seminovos: novosPossivel ? Math.max(0, totalGeral - totalNovos) : totalGeral,
  };

  // 'crm-veiculos-estoque-count*' nao compartilha prefixo com 'crm-veiculos-estoque' (strings
  // diferentes) -- invalidateQueries por prefixo nao pega os dois sozinho, precisa dos tres.
  const invalidateVeiculosEstoque = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque'] }),
    queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque-count'] }),
    queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque-count-novos'] }),
  ]);

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

  const { data: categorias = [] } = useQuery({
    queryKey: ['crm-categorias-veiculo'],
    queryFn: () => crmDataClient.entities.CategoriaVeiculo.list('nome'),
    enabled: canConfigure,
  });

  const { data: cores = [] } = useQuery({
    queryKey: ['crm-cores-veiculo'],
    queryFn: () => crmDataClient.entities.CorVeiculo.list('nome'),
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['crm-responsaveis'],
    queryFn: () => crmDataClient.entities.Responsavel.list(),
    enabled: canConfigure,
  });

  const marcaNomePorId = useMemo(() => Object.fromEntries(marcas.map((marca) => [marca.id, marca.nome])), [marcas]);
  const modeloPorId = useMemo(() => Object.fromEntries(modelos.map((modelo) => [modelo.id, modelo])), [modelos]);
  const versaoNomePorId = useMemo(() => Object.fromEntries(versoes.map((versao) => [versao.id, versao.nome])), [versoes]);

  const versoesDoModelo = useMemo(
    () => versoes.filter((versao) => versao.modelo_id === form.modelo_id && versao.ativo),
    [versoes, form.modelo_id],
  );

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.VeiculoEstoque.create(data),
    onMutate: () => {
      setForm(emptyForm);
    },
    onSuccess: async () => {
      await invalidateVeiculosEstoque();
      setNovoVeiculoDialogOpen(false);
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
      await invalidateVeiculosEstoque();
      toast({ title: 'Veiculo atualizado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar o veiculo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.VeiculoEstoque.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['crm-veiculos-estoque'] });
      const previousVeiculos = queryClient.getQueryData(veiculosQueryKey);
      queryClient.setQueryData(veiculosQueryKey, (currentPage = veiculosPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).filter((veiculo) => veiculo.id !== id),
      }));
      return { previousVeiculos };
    },
    onSuccess: () => {
      toast({ title: 'Veiculo excluido do estoque', variant: 'success' });
    },
    onError: (mutationError, _id, context) => {
      // tem FK real (propostas/vendas vinculadas ao estoque) que pode rejeitar o delete —
      // por isso desfaz a remocao otimista e devolve a linha a lista em caso de erro
      if (context?.previousVeiculos) {
        queryClient.setQueryData(veiculosQueryKey, context.previousVeiculos);
      }
      toast({
        title: 'Nao foi possivel excluir o veiculo',
        description: mutationError.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      invalidateVeiculosEstoque();
    },
  });

  const createModeloMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.ModeloVeiculo.create(data),
    onSuccess: async (modelo) => {
      await queryClient.invalidateQueries({ queryKey: ['crm-modelos-veiculo'] });
      setForm((prev) => ({ ...prev, modelo_id: modelo.id, versao_id: '' }));
      setModeloDialogOpen(false);
      setNovoModelo(emptyNovoModelo);
      toast({ title: 'Modelo criado', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar o modelo',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const createVersaoMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.VersaoVeiculo.create(data),
    onSuccess: async (versao) => {
      await queryClient.invalidateQueries({ queryKey: ['crm-versoes-veiculo'] });
      setForm((prev) => ({ ...prev, versao_id: versao.id }));
      setVersaoDialogOpen(false);
      setNovaVersaoNome('');
      toast({ title: 'Versao criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a versao',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const createCorMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.CorVeiculo.create(data),
    onSuccess: async (cor) => {
      await queryClient.invalidateQueries({ queryKey: ['crm-cores-veiculo'] });
      setForm((prev) => ({ ...prev, cor_id: cor.id }));
      setCorDialogOpen(false);
      setNovaCorNome('');
      toast({ title: 'Cor criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a cor',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const handleCreateModelo = (event) => {
    event.preventDefault();
    const nome = novoModelo.nome.trim();
    if (!nome || !novoModelo.marca_id || !novoModelo.categoria_veiculo_id) return;
    createModeloMutation.mutate({
      nome,
      marca_id: novoModelo.marca_id,
      categoria_veiculo_id: novoModelo.categoria_veiculo_id,
      ativo: true,
      ano_inicio: novoModelo.ano_inicio ? Number(novoModelo.ano_inicio) : null,
      ano_fim: novoModelo.ano_fim ? Number(novoModelo.ano_fim) : null,
    });
  };

  const handleCreateVersao = (event) => {
    event.preventDefault();
    const nome = novaVersaoNome.trim();
    if (!nome || !form.modelo_id) return;
    createVersaoMutation.mutate({ nome, modelo_id: form.modelo_id, ativo: true });
  };

  const handleCreateCor = (event) => {
    event.preventDefault();
    const nome = novaCorNome.trim();
    if (!nome) return;
    createCorMutation.mutate({ nome });
  };

  const handleCreate = (event) => {
    event.preventDefault();
    const chassi = form.chassi.trim();
    if (!chassi || !form.modelo_id) return;
    createMutation.mutate({
      modelo_id: form.modelo_id,
      versao_id: form.versao_id || null,
      chassi,
      placa: form.placa.trim() || null,
      cor_id: form.cor_id || null,
      km: form.km ? Number(form.km) : null,
      condicao: form.condicao,
      status: form.status,
      preco: form.preco ? Number(form.preco) : null,
      situacao: form.situacao,
      vendedor_reserva_id: form.vendedor_reserva_id || null,
      cliente_reserva_id: form.cliente_reserva_id || null,
    });
  };

  const abrirReservaDialog = (veiculo) => {
    setReservaDialogVeiculo(veiculo);
    setReservaForm({
      vendedor_reserva_id: veiculo.vendedor_reserva_id || '',
      cliente_reserva_id: veiculo.cliente_reserva_id || '',
      cliente_reserva_nome: veiculo.cliente_reserva_nome || '',
    });
  };

  const handleSalvarReserva = () => {
    updateMutation.mutate({
      id: reservaDialogVeiculo.id,
      ...reservaDialogVeiculo,
      vendedor_reserva_id: reservaForm.vendedor_reserva_id || null,
      cliente_reserva_id: reservaForm.cliente_reserva_id || null,
    });
    setReservaDialogVeiculo(null);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="flex gap-3">
          <div className="w-1.5 shrink-0 bg-primary" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest">Estoque</h1>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              Veiculos fisicos disponiveis para venda, identificados por chassi/placa. Reaproveita o
              catalogo de Marca / Modelo / Versao usado no cadastro de leads.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex border border-border bg-white">
            {ABAS_CONDICAO.map((aba) => (
              <button
                key={aba.value}
                type="button"
                onClick={() => setAbaCondicao(aba.value)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  abaCondicao === aba.value ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>
          {canConfigure ? (
            <Button
              type="button"
              onClick={() => setNovoVeiculoDialogOpen(true)}
              className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar veiculo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total de veiculos', valor: resumoEstoque.total, icon: Car },
          { label: 'Novos', valor: resumoEstoque.novos, icon: Star },
          { label: 'Seminovos', valor: resumoEstoque.seminovos, icon: RotateCcw },
        ].map((card) => (
          <div key={card.label} className="relative flex items-center gap-4 overflow-hidden border bg-white p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <card.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-3xl font-black">{card.valor}</p>
            </div>
            <card.icon className="pointer-events-none absolute -bottom-2 -right-2 h-20 w-20 text-muted-foreground/10" />
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-3 border bg-white p-4 md:grid-cols-5">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Marca</Label>
          <Input
            value={filtros.marca}
            onChange={(event) => setFiltros((prev) => ({ ...prev, marca: event.target.value }))}
            placeholder="Selecione a marca"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Modelo</Label>
          <Input
            value={filtros.modelo}
            onChange={(event) => setFiltros((prev) => ({ ...prev, modelo: event.target.value }))}
            placeholder="Selecione o modelo"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Chassi</Label>
          <Input
            value={filtros.chassi}
            onChange={(event) => setFiltros((prev) => ({ ...prev, chassi: event.target.value }))}
            placeholder="Ex.: 93XATGK1WVCT33302"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Placa</Label>
          <Input
            value={filtros.placa}
            onChange={(event) => setFiltros((prev) => ({ ...prev, placa: event.target.value }))}
            placeholder="Ex.: ABC1D23"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Cor</Label>
          <Input
            value={filtros.cor}
            onChange={(event) => setFiltros((prev) => ({ ...prev, cor: event.target.value }))}
            placeholder="Selecione a cor"
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Km (ate)</Label>
          <Input
            type="number"
            min="0"
            value={filtros.km}
            onChange={(event) => setFiltros((prev) => ({ ...prev, km: event.target.value }))}
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Preco (ate)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={filtros.preco}
            onChange={(event) => setFiltros((prev) => ({ ...prev, preco: event.target.value }))}
            className="h-9 rounded-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Condicao</Label>
          <Select
            value={filtros.condicao || 'todas'}
            onValueChange={(value) => setFiltros((prev) => ({ ...prev, condicao: value === 'todas' ? '' : value }))}
          >
            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="todas">Todas</SelectItem>
              {CONDICAO_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Status</Label>
          <Select
            value={filtros.status || 'todos'}
            onValueChange={(value) => setFiltros((prev) => ({ ...prev, status: value === 'todos' ? '' : value }))}
          >
            <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="todos">Todos</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" className="h-9 w-full rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90">
            <Search className="mr-2 h-4 w-4" /> Filtrar
          </Button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Lista de veiculos em estoque ({veiculosPage.count || 0})
        </p>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar na lista..."
            className="h-9 rounded-none pl-8"
          />
        </div>
      </div>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando estoque...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && veiculos.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhum veiculo encontrado.</p>
      ) : null}

      {!isLoading && !error && veiculos.length > 0 ? (
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
                <TableHead className="text-white">Situacao</TableHead>
                <TableHead className="text-white">Reserva</TableHead>
                <TableHead className="text-white">Status</TableHead>
                {canConfigure ? <TableHead className="text-white" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {veiculos.map((veiculo) => {
                const modelo = modeloPorId[veiculo.modelo_id];
                return (
                  <TableRow key={veiculo.id}>
                    <TableCell className="text-sm text-slate-700">{modelo ? (marcaNomePorId[modelo.marca_id] || '-') : '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{modelo?.nome || '-'}</TableCell>
                    <TableCell className="text-sm text-slate-700">{versaoNomePorId[veiculo.versao_id] || '-'}</TableCell>
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
                          value={veiculo.situacao}
                          onValueChange={(situacao) => updateMutation.mutate({ id: veiculo.id, ...veiculo, situacao })}
                        >
                          <SelectTrigger className={`h-8 w-40 rounded-none text-xs ${SITUACAO_BADGE_CLASS[veiculo.situacao] || ''}`}><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-none">
                            {SITUACAO_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${SITUACAO_BADGE_CLASS[veiculo.situacao] || ''}`}>
                          {SITUACAO_OPTIONS.find((option) => option.value === veiculo.situacao)?.label || '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="text-xs leading-tight">
                          <p className="font-semibold text-slate-700">{veiculo.vendedor_reserva_nome || '-'}</p>
                          <p className="text-muted-foreground">{veiculo.cliente_reserva_nome || '-'}</p>
                        </div>
                        {canConfigure ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-none"
                            title="Editar reserva"
                            onClick={() => abrirReservaDialog(veiculo)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
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
                    {canConfigure ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-none text-red-600"
                          onClick={() => setVeiculoParaExcluir(veiculo)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListPagination
            count={veiculosPage.count}
            isFetching={isLoading}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
      ) : null}

      {updateMutation.isPending ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Save className="h-3.5 w-3.5" /> Salvando...
        </div>
      ) : null}

      <Dialog open={novoVeiculoDialogOpen} onOpenChange={(open) => { setNovoVeiculoDialogOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent className="rounded-none sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-widest">Adicionar veiculo ao estoque</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Modelo</Label>
              <div className="flex gap-1">
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
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-none px-2"
                  title="Nao encontrei o modelo"
                  onClick={() => setModeloDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Versao</Label>
              <div className="flex gap-1">
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
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-none px-2"
                  title="Nao encontrei a versao"
                  disabled={!form.modelo_id}
                  onClick={() => setVersaoDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
              <div className="flex gap-1">
                <Select
                  value={form.cor_id}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, cor_id: value }))}
                >
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a cor" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {cores.map((cor) => (
                      <SelectItem key={cor.id} value={cor.id}>{cor.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-none px-2"
                  title="Nao encontrei a cor"
                  onClick={() => setCorDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Situacao</Label>
              <Select value={form.situacao} onValueChange={(value) => setForm((prev) => ({ ...prev, situacao: value }))}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {SITUACAO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Vendedor da reserva</Label>
              <Select
                value={form.vendedor_reserva_id || 'nenhum'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, vendedor_reserva_id: value === 'nenhum' ? '' : value }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {vendedores.map((vendedor) => (
                    <SelectItem key={vendedor.id} value={vendedor.id}>{vendedor.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Cliente da reserva</Label>
              <ClienteReservaField
                value={form.cliente_reserva_id}
                nome={form.cliente_reserva_nome}
                onSelect={(item) => setForm((prev) => ({ ...prev, cliente_reserva_id: item.id, cliente_reserva_nome: item.nome }))}
                onClear={() => setForm((prev) => ({ ...prev, cliente_reserva_id: '', cliente_reserva_nome: '' }))}
              />
            </div>
            <DialogFooter className="md:col-span-2">
              <Button
                type="submit"
                disabled={!form.chassi.trim() || !form.modelo_id || createMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Adicionando...' : 'Adicionar ao estoque'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={modeloDialogOpen} onOpenChange={(open) => { setModeloDialogOpen(open); if (!open) setNovoModelo(emptyNovoModelo); }}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo modelo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateModelo} className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Marca</Label>
              <Select
                value={novoModelo.marca_id}
                onValueChange={(value) => setNovoModelo((prev) => ({ ...prev, marca_id: value }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a marca" /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {marcas.map((marca) => (
                    <SelectItem key={marca.id} value={marca.id}>{marca.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Categoria</Label>
              <Select
                value={novoModelo.categoria_veiculo_id}
                onValueChange={(value) => setNovoModelo((prev) => ({ ...prev, categoria_veiculo_id: value }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {categorias.map((categoria) => (
                    <SelectItem key={categoria.id} value={categoria.id}>{categoria.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Nome do modelo</Label>
              <Input
                value={novoModelo.nome}
                onChange={(event) => setNovoModelo((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Ex.: Civic"
                className="h-9 rounded-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Ano inicio</Label>
                <Input
                  type="number"
                  value={novoModelo.ano_inicio}
                  onChange={(event) => setNovoModelo((prev) => ({ ...prev, ano_inicio: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Ano fim</Label>
                <Input
                  type="number"
                  value={novoModelo.ano_fim}
                  onChange={(event) => setNovoModelo((prev) => ({ ...prev, ano_fim: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!novoModelo.nome.trim() || !novoModelo.marca_id || !novoModelo.categoria_veiculo_id || createModeloMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                {createModeloMutation.isPending ? 'Criando...' : 'Criar modelo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={versaoDialogOpen} onOpenChange={(open) => { setVersaoDialogOpen(open); if (!open) setNovaVersaoNome(''); }}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova versao</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateVersao} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Modelo: <span className="font-bold">{marcaNomePorId[modeloPorId[form.modelo_id]?.marca_id] || '-'} {modeloPorId[form.modelo_id]?.nome || '-'}</span>
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Nome da versao</Label>
              <Input
                value={novaVersaoNome}
                onChange={(event) => setNovaVersaoNome(event.target.value)}
                placeholder="Ex.: LX"
                className="h-9 rounded-none"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!novaVersaoNome.trim() || createVersaoMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                {createVersaoMutation.isPending ? 'Criando...' : 'Criar versao'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={corDialogOpen} onOpenChange={(open) => { setCorDialogOpen(open); if (!open) setNovaCorNome(''); }}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova cor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCor} className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Nome da cor</Label>
              <Input
                value={novaCorNome}
                onChange={(event) => setNovaCorNome(event.target.value)}
                placeholder="Ex.: Cinza Londrino"
                className="h-9 rounded-none"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!novaCorNome.trim() || createCorMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                {createCorMutation.isPending ? 'Criando...' : 'Criar cor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reservaDialogVeiculo)} onOpenChange={(open) => !open && setReservaDialogVeiculo(null)}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-widest">Editar reserva</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Vendedor</Label>
              <Select
                value={reservaForm.vendedor_reserva_id || 'nenhum'}
                onValueChange={(value) => setReservaForm((prev) => ({ ...prev, vendedor_reserva_id: value === 'nenhum' ? '' : value }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {vendedores.map((vendedor) => (
                    <SelectItem key={vendedor.id} value={vendedor.id}>{vendedor.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Cliente</Label>
              <ClienteReservaField
                value={reservaForm.cliente_reserva_id}
                nome={reservaForm.cliente_reserva_nome}
                onSelect={(item) => setReservaForm((prev) => ({ ...prev, cliente_reserva_id: item.id, cliente_reserva_nome: item.nome }))}
                onClear={() => setReservaForm((prev) => ({ ...prev, cliente_reserva_id: '', cliente_reserva_nome: '' }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              onClick={() => setReservaDialogVeiculo(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              onClick={handleSalvarReserva}
            >
              Salvar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(veiculoParaExcluir)} onOpenChange={(open) => !open && setVeiculoParaExcluir(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-widest">Excluir veiculo do estoque</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o veiculo "{veiculoParaExcluir?.chassi}" do estoque? Isso remove apenas o
              registro de estoque, nao o cadastro do veiculo. Essa acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs font-bold uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 text-xs font-bold uppercase tracking-wider hover:bg-red-700"
              onClick={() => {
                deleteMutation.mutate(veiculoParaExcluir.id);
                setVeiculoParaExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
