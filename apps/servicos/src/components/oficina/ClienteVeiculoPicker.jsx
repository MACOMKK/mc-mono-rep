import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { supabase } from '@macom/api-client/supabaseClient';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner } from '@macom/ui';
import {
  formatDocumento,
  formatTelefone,
  isValidCpfCnpj,
  isValidEmail,
  isValidTelefone,
  normalizeEmail,
  onlyDigits,
  toUpperText,
} from '@/lib/oficinaFormat';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

// `inicial` (com id) liga o modo edicao; sem ele o formulario cadastra. `onCriado` e chamado nos dois casos.
export function ClienteForm({ inicial, onCriado, onCancelar }) {
  const editando = Boolean(inicial?.id);
  const [nome, setNome] = useState(toUpperText(inicial?.nome || ''));
  const [telefone, setTelefone] = useState(onlyDigits(inicial?.telefone || '').slice(0, 11));
  const [email, setEmail] = useState(normalizeEmail(inicial?.email || '') || '');
  const [cpfCnpj, setCpfCnpj] = useState(onlyDigits(inicial?.cpf_cnpj || '').slice(0, 14));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleSalvar = async () => {
    if (!nome.trim() || !telefone) {
      setErro('Nome e telefone são obrigatórios.');
      return;
    }
    if (!isValidTelefone(telefone)) {
      setErro('Telefone inválido. Informe DDD + número.');
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      setErro('E-mail inválido.');
      return;
    }
    if (cpfCnpj && !isValidCpfCnpj(cpfCnpj)) {
      setErro('CPF/CNPJ inválido.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const dados = { nome: nome.trim(), telefone, email: normalizeEmail(email), cpfCnpj };
      const cliente = editando
        ? await oficinaApi.clientes.atualizar({ id: inicial.id, ...dados })
        : await oficinaApi.clientes.criar(dados);
      onCriado(cliente);
    } catch (error) {
      setErro(error.message || (editando ? 'Não foi possível salvar o cliente.' : 'Não foi possível cadastrar o cliente.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Input placeholder="Nome *" className="uppercase" value={nome} onChange={(e) => setNome(toUpperText(e.target.value))} />
      <Input
        placeholder="Telefone *"
        inputMode="numeric"
        value={formatTelefone(telefone)}
        onChange={(e) => setTelefone(onlyDigits(e.target.value).slice(0, 11))}
      />
      <Input
        placeholder="E-mail"
        type="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value.toLowerCase().replace(/\s/g, ''))}
      />
      <Input
        placeholder="CPF/CNPJ"
        inputMode="numeric"
        value={formatDocumento(cpfCnpj)}
        onChange={(e) => setCpfCnpj(onlyDigits(e.target.value).slice(0, 14))}
      />
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
        </Button>
      </div>
    </div>
  );
}

// `inicial` (com id, modelo_id, marca_id, versao_id, cor_id, placa, chassi, km) liga o modo edicao.
export function VeiculoForm({ inicial, onCriado, onCancelar }) {
  const editando = Boolean(inicial?.id);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [cores, setCores] = useState([]);
  const [marcaId, setMarcaId] = useState(inicial?.marca_id || '');
  const [modeloId, setModeloId] = useState(inicial?.modelo_id || '');
  const [placa, setPlaca] = useState(inicial?.placa || '');
  const [chassi, setChassi] = useState(inicial?.chassi || '');
  const [corId, setCorId] = useState(inicial?.cor_id || '');
  const [novaCorAberta, setNovaCorAberta] = useState(false);
  const [novaCorNome, setNovaCorNome] = useState('');
  const [km, setKm] = useState(inicial?.km != null ? String(inicial.km) : '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    supabase
      .from('marcas_veiculo')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMarcas(data || []));
    oficinaApi.cores.listar().then(setCores);
  }, []);

  const handleCriarCor = async () => {
    const nome = novaCorNome.trim();
    if (!nome) return;
    const cor = await oficinaApi.cores.criar(nome);
    if (cor) {
      setCores((prev) => [...prev, cor].sort((a, b) => a.nome.localeCompare(b.nome)));
      setCorId(cor.id);
    }
    setNovaCorAberta(false);
    setNovaCorNome('');
  };

  useEffect(() => {
    if (!marcaId) {
      setModelos([]);
      return;
    }
    supabase
      .from('modelos_veiculo')
      .select('id, nome')
      .eq('marca_id', marcaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setModelos(data || []));
  }, [marcaId]);

  const handleSalvar = async () => {
    if (!modeloId || !chassi.trim()) {
      setErro('Modelo e chassi são obrigatórios.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const dados = {
        modeloId,
        chassi,
        placa: placa || undefined,
        corId: corId || undefined,
        km: km ? Number(km) : undefined,
      };
      const veiculo = editando
        ? await oficinaApi.veiculos.atualizar({ id: inicial.id, versaoId: inicial.versao_id, ...dados })
        : await oficinaApi.veiculos.criar(dados);
      onCriado(veiculo);
    } catch (error) {
      setErro(error.message || (editando ? 'Não foi possível salvar o veículo.' : 'Não foi possível cadastrar o veículo.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={marcaId}
          onValueChange={(valor) => {
            setMarcaId(valor);
            setModeloId('');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Marca *" />
          </SelectTrigger>
          <SelectContent>
            {marcas.map((marca) => (
              <SelectItem key={marca.id} value={marca.id}>
                {marca.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={modeloId} onValueChange={setModeloId} disabled={!marcaId}>
          <SelectTrigger>
            <SelectValue placeholder="Modelo *" />
          </SelectTrigger>
          <SelectContent>
            {modelos.map((modelo) => (
              <SelectItem key={modelo.id} value={modelo.id}>
                {modelo.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        placeholder="Chassi *"
        className="uppercase"
        value={chassi}
        onChange={(e) => setChassi(toUpperText(e.target.value).replace(/\s/g, ''))}
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Placa"
          className="uppercase"
          value={placa}
          onChange={(e) => setPlaca(toUpperText(e.target.value).replace(/\s/g, ''))}
        />
        <Select value={corId} onValueChange={setCorId}>
          <SelectTrigger>
            <SelectValue placeholder="Cor" />
          </SelectTrigger>
          <SelectContent>
            {cores.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Km" type="number" value={km} onChange={(e) => setKm(e.target.value)} />
      </div>
      {!novaCorAberta && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setNovaCorAberta(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Cor não encontrada
        </Button>
      )}
      {novaCorAberta && (
        <div className="flex gap-2">
          <Input
            placeholder="Nome da nova cor"
            className="uppercase"
            value={novaCorNome}
            onChange={(e) => setNovaCorNome(toUpperText(e.target.value))}
          />
          <Button type="button" size="sm" onClick={handleCriarCor} disabled={!novaCorNome.trim()}>
            Adicionar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setNovaCorAberta(false); setNovaCorNome(''); }}>
            Cancelar
          </Button>
        </div>
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
        </Button>
      </div>
    </div>
  );
}

export default function ClienteVeiculoPicker({ tipo, value, onChange, label }) {
  const [busca, setBusca] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const buscaDebounced = useDebouncedValue(busca);
  const termoBusca = buscaDebounced.trim();
  const termoValido = termoBusca.length >= 2;

  const {
    data: resultados = [],
    isFetching: buscando,
    error: erroBuscaQuery,
  } = useQuery({
    queryKey: ['oficina', tipo, 'busca', termoBusca],
    queryFn: ({ signal }) =>
      (tipo === 'cliente' ? oficinaApi.clientes.buscar : oficinaApi.veiculos.buscar)(termoBusca, { signal }),
    enabled: termoValido,
    staleTime: 30_000,
    retry: 1,
  });
  const erroBusca = termoValido ? erroBuscaQuery?.message || null : null;

  if (value) {
    const descricao =
      tipo === 'cliente'
        ? value.nome
        : [value.marca_nome, value.modelo_nome, value.placa || value.chassi].filter(Boolean).join(' · ');
    return (
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium">{descricao}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={tipo === 'cliente' ? 'Buscar cliente por nome/telefone...' : 'Buscar veículo por placa/chassi...'}
          className="pl-9 pr-9"
        />
        {buscando && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}
      </div>

      {erroBusca && <p className="text-xs text-destructive">{erroBusca}</p>}

      {termoValido && resultados.length > 0 && (
        <div className="flex flex-col divide-y rounded-lg border">
          {resultados.map((item) => (
            <button
              key={item.id}
              type="button"
              className="p-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(item);
                setBusca('');
              }}
            >
              {tipo === 'cliente'
                ? `${item.nome} ${item.telefone ? '· ' + formatTelefone(item.telefone) : ''}`
                : [item.marca_nome, item.modelo_nome, item.placa || item.chassi].filter(Boolean).join(' · ')}
            </button>
          ))}
        </div>
      )}

      {!mostrarForm && (
        <Button type="button" variant="outline" size="sm" onClick={() => setMostrarForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Cadastrar {tipo === 'cliente' ? 'cliente' : 'veículo'} novo
        </Button>
      )}

      {mostrarForm && tipo === 'cliente' && (
        <ClienteForm
          onCriado={(cliente) => {
            onChange(cliente);
            setMostrarForm(false);
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {mostrarForm && tipo === 'veiculo' && (
        <VeiculoForm
          onCriado={(veiculo) => {
            onChange(veiculo);
            setMostrarForm(false);
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}
    </div>
  );
}
