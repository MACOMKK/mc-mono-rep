import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { supabase } from '@macom/api-client/supabaseClient';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@macom/ui';

function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function ClienteForm({ onCriado, onCancelar }) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleSalvar = async () => {
    if (!nome.trim() || !telefone.trim()) {
      setErro('Nome e telefone são obrigatórios.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const cliente = await oficinaApi.clientes.criar({ nome, telefone, email, cpfCnpj });
      onCriado(cliente);
    } catch (error) {
      setErro(error.message || 'Não foi possível cadastrar o cliente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Input placeholder="Nome *" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Input placeholder="Telefone *" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="CPF/CNPJ" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} />
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Cadastrar'}
        </Button>
      </div>
    </div>
  );
}

export function VeiculoForm({ onCriado, onCancelar }) {
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [cores, setCores] = useState([]);
  const [marcaId, setMarcaId] = useState('');
  const [modeloId, setModeloId] = useState('');
  const [placa, setPlaca] = useState('');
  const [chassi, setChassi] = useState('');
  const [corId, setCorId] = useState('');
  const [novaCorAberta, setNovaCorAberta] = useState(false);
  const [novaCorNome, setNovaCorNome] = useState('');
  const [km, setKm] = useState('');
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
      setModeloId('');
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
      const veiculo = await oficinaApi.veiculos.criar({
        modeloId,
        chassi,
        placa: placa || undefined,
        corId: corId || undefined,
        km: km ? Number(km) : undefined,
      });
      onCriado(veiculo);
    } catch (error) {
      setErro(error.message || 'Não foi possível cadastrar o veículo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={marcaId} onValueChange={setMarcaId}>
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
      <Input placeholder="Chassi *" value={chassi} onChange={(e) => setChassi(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Placa" value={placa} onChange={(e) => setPlaca(e.target.value)} />
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
          <Input placeholder="Nome da nova cor" value={novaCorNome} onChange={(e) => setNovaCorNome(e.target.value)} />
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
          {salvando ? 'Salvando...' : 'Cadastrar'}
        </Button>
      </div>
    </div>
  );
}

export default function ClienteVeiculoPicker({ tipo, value, onChange, label }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erroBusca, setErroBusca] = useState(null);
  const buscaDebounced = useDebouncedValue(busca);

  useEffect(() => {
    if (!buscaDebounced.trim()) {
      setResultados([]);
      setErroBusca(null);
      return;
    }
    const buscar = tipo === 'cliente' ? oficinaApi.clientes.buscar : oficinaApi.veiculos.buscar;
    buscar(buscaDebounced)
      .then((rows) => {
        setResultados(rows);
        setErroBusca(null);
      })
      .catch((error) => {
        setResultados([]);
        setErroBusca(error.message || 'Falha ao buscar.');
      });
  }, [buscaDebounced, tipo]);

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
          className="pl-9"
        />
      </div>

      {erroBusca && <p className="text-xs text-destructive">{erroBusca}</p>}

      {resultados.length > 0 && (
        <div className="flex flex-col divide-y rounded-lg border">
          {resultados.map((item) => (
            <button
              key={item.id}
              type="button"
              className="p-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(item);
                setBusca('');
                setResultados([]);
              }}
            >
              {tipo === 'cliente'
                ? `${item.nome} ${item.telefone ? '· ' + item.telefone : ''}`
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
