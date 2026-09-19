import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, CarLoader, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea } from '@macom/ui';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { useAuth } from '@/lib/AuthContext';
import ClienteVeiculoPicker from '@/components/oficina/ClienteVeiculoPicker';
import CombustivelGauge from '@/components/oficina/CombustivelGauge';
import AvariaMap from '@/components/oficina/AvariaMap';
import ChecklistItensList from '@/components/oficina/ChecklistItensList';
import FotoUploadGrid from '@/components/oficina/FotoUploadGrid';
import AssinaturaModal from '@/components/oficina/AssinaturaModal';
import { CATEGORIA_ITENS } from '@/lib/checklistItens';

const COMUNICACOES_OPCOES = [
  { key: 'concessionarias', label: 'Das concessionárias Mitsubishi e/ou reparadores autorizados Mitsubishi' },
  { key: 'grupo', label: 'De qualquer empresa pertencente ao grupo Mitsubishi' },
  { key: 'parceiro', label: 'De qualquer parceiro Mitsubishi' },
];

const DRAFT_KEY = 'macom-oficina-checklist-draft';
const ETAPAS = [
  'Dados do veículo',
  'Inspeção geral',
  'Documentação',
  'Segurança',
  'Pneus',
  'Observações',
  'Fotos',
  'Assinatura',
  'Finalização',
];

function itensParaMapa(itensArray) {
  const mapa = {};
  itensArray.forEach((item) => {
    if (!mapa[item.categoria]) mapa[item.categoria] = {};
    mapa[item.categoria][item.item] = item.status;
  });
  return mapa;
}

export default function ChecklistForm() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [carregando, setCarregando] = useState(Boolean(idParam));
  const [etapa, setEtapa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const [avaliacaoId, setAvaliacaoId] = useState(idParam || null);
  const [cliente, setCliente] = useState(null);
  const [veiculo, setVeiculo] = useState(null);
  const [os, setOs] = useState('');
  const [km, setKm] = useState('');
  const [nivelCombustivel, setNivelCombustivel] = useState(0.5);
  const [pinturaSuja, setPinturaSuja] = useState(false);
  const [avarias, setAvarias] = useState([]);
  const [itensPorCategoria, setItensPorCategoria] = useState({ documentacao: {}, seguranca: {}, pneus: {} });
  const [observacoes, setObservacoes] = useState('');
  const [comunicacoes, setComunicacoes] = useState([]);
  const [entregaObservacoes, setEntregaObservacoes] = useState('');
  const [entregaConferida, setEntregaConferida] = useState(false);
  const [fotos, setFotos] = useState([]);
  const [assinaturaCliente, setAssinaturaCliente] = useState(null);
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [avisoDonoDiferente, setAvisoDonoDiferente] = useState(null);
  const [transferindo, setTransferindo] = useState(false);
  const [dadosCarregados, setDadosCarregados] = useState(null);

  useEffect(() => {
    if (!idParam) {
      const draftBruto = localStorage.getItem(DRAFT_KEY);
      if (draftBruto) {
        try {
          const draft = JSON.parse(draftBruto);
          setAvaliacaoId(draft.avaliacaoId || null);
          setCliente(draft.cliente || null);
          setVeiculo(draft.veiculo || null);
          setOs(draft.os || '');
          setKm(draft.km || '');
          setNivelCombustivel(draft.nivelCombustivel ?? 0.5);
          setPinturaSuja(Boolean(draft.pinturaSuja));
          setObservacoes(draft.observacoes || '');
          setComunicacoes(Array.isArray(draft.comunicacoes) ? draft.comunicacoes : []);
          setEntregaObservacoes(draft.entregaObservacoes || '');
          setEntregaConferida(Boolean(draft.entregaConferida));
          setEtapa(draft.etapa || 0);
        } catch {
          // rascunho corrompido, ignora
        }
      }
      return;
    }

    oficinaApi.checklists
      .obter(idParam)
      .then(({ row, itens, avarias: avariasCarregadas }) => {
        if (!row) return;
        setDadosCarregados({ row, itens, avarias: avariasCarregadas });
        setCliente(row.cliente_id ? { id: row.cliente_id, nome: row.cliente_nome, telefone: row.cliente_telefone } : null);
        setVeiculo(
          row.veiculo_id
            ? { id: row.veiculo_id, placa: row.veiculo_placa, chassi: row.veiculo_chassi, modelo_nome: row.veiculo_modelo, cor: row.veiculo_cor }
            : null,
        );
        setOs(row.os || '');
        setKm(row.km ?? '');
        setNivelCombustivel(row.nivel_combustivel ?? 0.5);
        setPinturaSuja(Boolean(row.pintura_suja));
        setObservacoes(row.observacoes || '');
        setComunicacoes(Array.isArray(row.comunicacoes) ? row.comunicacoes : []);
        setEntregaObservacoes(row.entrega_observacoes || '');
        setEntregaConferida(Boolean(row.entrega_conferida));
        setFotos(row.fotos || []);
        setAssinaturaCliente(row.assinatura_cliente || null);
        setAvarias(avariasCarregadas || []);
        setItensPorCategoria((prev) => ({ ...prev, ...itensParaMapa(itens || []) }));
      })
      .finally(() => setCarregando(false));
  }, [idParam]);

  useEffect(() => {
    if (idParam) return;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        avaliacaoId,
        cliente,
        veiculo,
        os,
        km,
        nivelCombustivel,
        pinturaSuja,
        observacoes,
        comunicacoes,
        entregaObservacoes,
        entregaConferida,
        etapa,
      }),
    );
  }, [idParam, avaliacaoId, cliente, veiculo, os, km, nivelCombustivel, pinturaSuja, observacoes, comunicacoes, entregaObservacoes, entregaConferida, etapa]);

  const limparRascunho = () => localStorage.removeItem(DRAFT_KEY);

  const handleCancelar = () => {
    if (idParam) {
      navigate(`/oficina/checklists/${idParam}`, { state: dadosCarregados ? { checklistCarregado: dadosCarregados } : undefined });
      return;
    }
    if (!avaliacaoId) {
      limparRascunho();
    }
    navigate('/oficina/checklists');
  };

  const handleIniciarOuAtualizarDados = async () => {
    if (!veiculo) {
      setErro('Selecione ou cadastre o veículo.');
      return;
    }

    if (avaliacaoId) {
      setErro(null);
      setEtapa((atual) => atual + 1);
      oficinaApi.checklists
        .atualizar(avaliacaoId, { os: os || null, km: km ? Number(km) : null })
        .catch((error) => {
          setErro(error.message || 'Não foi possível salvar os dados do veículo automaticamente. Volte a esta etapa e clique em Avançar novamente.');
        });
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const { row, avisoDonoDiferente: aviso } = await oficinaApi.checklists.iniciar({
        veiculoId: veiculo.id,
        clienteId: cliente?.id,
        os: os || undefined,
        km: km ? Number(km) : undefined,
      });
      setAvaliacaoId(row.id);
      if (aviso) setAvisoDonoDiferente(aviso);
      setEtapa((atual) => atual + 1);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar os dados do veículo.');
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarInspecaoGeral = () => {
    setErro(null);
    setEtapa((atual) => atual + 1);
    oficinaApi.checklists
      .atualizar(avaliacaoId, { nivel_combustivel: nivelCombustivel, pintura_suja: pinturaSuja })
      .catch((error) => {
        setErro(error.message || 'Não foi possível salvar a inspeção geral automaticamente. Volte a esta etapa e clique em Avançar novamente.');
      });
  };

  const handleAdicionarAvaria = async ({ tipo, pos_x, pos_y }) => {
    try {
      const row = await oficinaApi.avarias.adicionar(avaliacaoId, { tipo, posX: pos_x, posY: pos_y });
      setAvarias((atual) => [...atual, row]);
    } catch (error) {
      setErro(error.message || 'Não foi possível registrar a avaria.');
    }
  };

  const handleRemoverAvaria = async (avariaId) => {
    try {
      await oficinaApi.avarias.remover(avariaId);
      setAvarias((atual) => atual.filter((avaria) => avaria.id !== avariaId));
    } catch (error) {
      setErro(error.message || 'Não foi possível remover a avaria.');
    }
  };

  const handleSalvarCategoria = (categoria) => {
    const valores = itensPorCategoria[categoria] || {};
    const todosItens = CATEGORIA_ITENS[categoria] || [];
    const itensArray = todosItens.filter((item) => valores[item]).map((item) => ({ item, status: valores[item] }));

    if (itensArray.length < todosItens.length) {
      setErro(`Selecione um tipo para todos os itens em "${ETAPAS[etapa]}" antes de avançar.`);
      return;
    }

    setErro(null);
    setEtapa((atual) => atual + 1);
    oficinaApi.itens.upsert(avaliacaoId, categoria, itensArray).catch((error) => {
      setErro(error.message || 'Não foi possível salvar os itens automaticamente. Volte a esta etapa e clique em Avançar novamente.');
    });
  };

  const toggleComunicacao = (key) => {
    setComunicacoes((atual) => (atual.includes(key) ? atual.filter((item) => item !== key) : [...atual, key]));
  };

  const handleSalvarObservacoes = () => {
    setErro(null);
    setEtapa((atual) => atual + 1);
    oficinaApi.checklists
      .atualizar(avaliacaoId, { observacoes: observacoes || null, comunicacoes })
      .catch((error) => {
        setErro(error.message || 'Não foi possível salvar as observações automaticamente. Volte a esta etapa e clique em Avançar novamente.');
      });
  };

  const handleFinalizar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await oficinaApi.checklists.finalizar(avaliacaoId, {
        entregaConferida,
        entregaObservacoes: entregaObservacoes || undefined,
        assinaturaCliente: assinaturaCliente || undefined,
      });
      limparRascunho();
      navigate(`/oficina/checklists/${avaliacaoId}`);
    } catch (error) {
      setErro(error.message || 'Não foi possível finalizar o checklist.');
    } finally {
      setSalvando(false);
    }
  };

  const handleTransferirVeiculo = async () => {
    if (!veiculo?.id || !cliente?.id) return;
    setTransferindo(true);
    try {
      await oficinaApi.veiculos.transferir({ veiculoId: veiculo.id, clienteId: cliente.id });
      setAvisoDonoDiferente(null);
    } catch (error) {
      setErro(error.message || 'Não foi possível transferir o veículo.');
    } finally {
      setTransferindo(false);
    }
  };

  const setItemCategoria = (categoria) => (item, status) => {
    setItensPorCategoria((atual) => ({
      ...atual,
      [categoria]: { ...atual[categoria], [item]: status },
    }));
  };

  const progresso = useMemo(() => Math.round(((etapa + 1) / ETAPAS.length) * 100), [etapa]);

  if (carregando) {
    return <CarLoader inline />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground"
            onClick={handleCancelar}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
        <h1 className="text-xl font-bold">{idParam ? 'Editar checklist' : 'Nova avaliação'}</h1>
        <div className="mt-3 flex gap-1.5 overflow-x-auto rounded-xl border bg-card p-3 md:flex-wrap md:overflow-visible">
          {ETAPAS.map((nome, index) => {
            const concluida = index < etapa;
            const atual = index === etapa;
            const habilitada = index <= etapa;
            return (
              <button
                key={nome}
                type="button"
                disabled={!habilitada}
                onClick={() => habilitada && setEtapa(index)}
                className={`shrink-0 rounded-full px-2.5 py-1.5 text-center text-[11px] font-medium whitespace-nowrap transition-colors md:flex-1 xl:text-xs ${
                  atual
                    ? 'bg-primary text-primary-foreground'
                    : concluida
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-muted text-muted-foreground'
                } ${habilitada ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-60'}`}
              >
                {index + 1}. {nome}
              </button>
            );
          })}
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-muted">
          <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
        </div>
      </div>

      {erro && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

      {etapa === 0 && (
        <div className="flex flex-col gap-4">
          <ClienteVeiculoPicker tipo="cliente" label="Cliente (opcional)" value={cliente} onChange={setCliente} />
          <ClienteVeiculoPicker tipo="veiculo" label="Veículo *" value={veiculo} onChange={setVeiculo} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="O.S." value={os} onChange={(e) => setOs(e.target.value)} />
            <Input placeholder="Km" type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleIniciarOuAtualizarDados} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Avançar'}
            </Button>
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Inspeção do veículo</h2>

            <label htmlFor="pinturaSuja" className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox id="pinturaSuja" checked={pinturaSuja} onCheckedChange={(checked) => setPinturaSuja(checked === true)} />
              Veículo com pintura suja, impossibilitando inspeção/identificação de riscos e danos.
            </label>

            <AvariaMap avarias={avarias} onAdicionar={handleAdicionarAvaria} onRemover={handleRemoverAvaria} />
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4">
            <h2 className="self-start text-sm font-semibold">Nível de combustível</h2>
            <CombustivelGauge value={nivelCombustivel} onChange={setNivelCombustivel} />
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
              Voltar
            </Button>
            <Button type="button" onClick={handleSalvarInspecaoGeral}>
              Avançar
            </Button>
          </div>
        </div>
      )}

      {(etapa === 2 || etapa === 3 || etapa === 4) &&
        (() => {
          const categoria = ['documentacao', 'seguranca', 'pneus'][etapa - 2];
          return (
            <div className="flex flex-col gap-4">
              <ChecklistItensList
                categoria={categoria}
                valores={itensPorCategoria[categoria] || {}}
                onChange={setItemCategoria(categoria)}
              />
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
                  Voltar
                </Button>
                <Button type="button" onClick={() => handleSalvarCategoria(categoria)}>
                  Avançar
                </Button>
              </div>
            </div>
          );
        })()}

      {etapa === 5 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="observacoes">
              Observações / Reclamações do cliente
            </label>
            <Textarea id="observacoes" rows={6} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="entregaObservacoes">
              Observações da entrega
            </label>
            <Textarea
              id="entregaObservacoes"
              rows={3}
              value={entregaObservacoes}
              onChange={(e) => setEntregaObservacoes(e.target.value)}
            />
          </div>

          <label htmlFor="entregaConferida" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox id="entregaConferida" checked={entregaConferida} onCheckedChange={(checked) => setEntregaConferida(checked === true)} />
            Entrega conferida com o cliente.
          </label>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Comunicações eletrônicas</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Estou de acordo em receber informações / comunicações eletrônicas provindas:
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {COMUNICACOES_OPCOES.map((opcao) => (
                <label key={opcao.key} htmlFor={`comunicacao-${opcao.key}`} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id={`comunicacao-${opcao.key}`}
                    checked={comunicacoes.includes(opcao.key)}
                    onCheckedChange={() => toggleComunicacao(opcao.key)}
                  />
                  {opcao.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
              Voltar
            </Button>
            <Button type="button" onClick={handleSalvarObservacoes}>
              Avançar
            </Button>
          </div>
        </div>
      )}

      {etapa === 6 && (
        <div className="flex flex-col gap-4">
          <FotoUploadGrid
            avaliacaoId={avaliacaoId}
            fotos={fotos}
            onFotoAdicionada={(foto) => setFotos((atual) => [...atual, foto])}
            onFotoAtualizada={(foto) =>
              setFotos((atual) => atual.map((atual2) => (atual2.storage_path === foto.storage_path ? foto : atual2)))
            }
            onFotoRemovida={(storagePath) => setFotos((atual) => atual.filter((foto) => foto.storage_path !== storagePath))}
          />
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => setEtapa((atual) => atual + 1)}>
              Avançar
            </Button>
          </div>
        </div>
      )}

      {etapa === 7 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Assinatura do responsável</p>
            {user?.signatureUrl ? (
              <div className="mt-2 inline-block rounded-md bg-white p-1">
                <img src={user.signatureUrl} alt="Assinatura do responsável" className="h-16 object-contain" />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Nenhuma assinatura cadastrada no perfil.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Assinatura do cliente</p>
            {assinaturaCliente ? (
              <div className="mt-2 inline-block rounded-md bg-white p-1">
                <img src={assinaturaCliente} alt="Assinatura do cliente" className="h-16 object-contain" />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Ainda não capturada.</p>
            )}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setModalAssinaturaAberto(true)}>
              {assinaturaCliente ? 'Refazer assinatura' : 'Capturar assinatura'}
            </Button>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => setEtapa((atual) => atual + 1)}>
              Avançar
            </Button>
          </div>

          <AssinaturaModal
            open={modalAssinaturaAberto}
            onCancel={() => setModalAssinaturaAberto(false)}
            onConfirm={(dataUrl) => {
              setAssinaturaCliente(dataUrl);
              setModalAssinaturaAberto(false);
            }}
          />
        </div>
      )}

      {etapa === 8 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">Resumo</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd>{cliente?.nome || '—'}</dd>
              <dt className="text-muted-foreground">Veículo</dt>
              <dd>{veiculo?.placa || veiculo?.chassi || '—'}</dd>
              <dt className="text-muted-foreground">O.S.</dt>
              <dd>{os || '—'}</dd>
              <dt className="text-muted-foreground">Km</dt>
              <dd>{km || '—'}</dd>
              <dt className="text-muted-foreground">Avarias</dt>
              <dd>{avarias.length}</dd>
              <dt className="text-muted-foreground">Fotos</dt>
              <dd>{fotos.length}</dd>
            </dl>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setEtapa((atual) => atual - 1)}>
              Voltar
            </Button>
            <Button type="button" onClick={handleFinalizar} disabled={salvando}>
              {salvando ? 'Finalizando...' : 'Finalizar avaliação'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(avisoDonoDiferente)} onOpenChange={(open) => !open && setAvisoDonoDiferente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Veículo cadastrado para outro cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este veículo está cadastrado para <strong>{avisoDonoDiferente?.atual_nome}</strong>. Deseja transferir para{' '}
            <strong>{cliente?.nome}</strong>, ou apenas manter {avisoDonoDiferente?.atual_nome} como dono (alguém trouxe o
            carro em nome dele)?
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAvisoDonoDiferente(null)} disabled={transferindo}>
              Manter dono atual
            </Button>
            <Button type="button" onClick={handleTransferirVeiculo} disabled={transferindo}>
              {transferindo ? 'Transferindo...' : 'Transferir para ' + (cliente?.nome || 'este cliente')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
