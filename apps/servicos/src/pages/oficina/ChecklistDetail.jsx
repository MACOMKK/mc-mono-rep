import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Printer } from 'lucide-react';

import { Badge, Button, CarLoader, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea } from '@macom/ui';
import { oficinaApi } from '@macom/api-client/oficinaApi';
import { useAuth } from '@/lib/AuthContext';
import AvariaMap from '@/components/oficina/AvariaMap';
import ChecklistItensList from '@/components/oficina/ChecklistItensList';
import FotoUploadGrid from '@/components/oficina/FotoUploadGrid';
import AssinaturaModal from '@/components/oficina/AssinaturaModal';
import ChecklistDocumento from '@/pages/oficina/ChecklistDocumento';

const STATUS_LABEL = { em_andamento: 'Em andamento', avaliado: 'Avaliado', finalizado: 'Finalizado' };
const STATUS_VARIANT = { em_andamento: 'warning', avaliado: 'default', finalizado: 'success' };
const CATEGORIAS = ['documentacao', 'seguranca', 'pneus'];
const COMUNICACOES_LABEL = {
  concessionarias: 'Das concessionárias Mitsubishi e/ou reparadores autorizados Mitsubishi',
  grupo: 'De qualquer empresa pertencente ao grupo Mitsubishi',
  parceiro: 'De qualquer parceiro Mitsubishi',
};

function itensParaMapa(itensArray) {
  const mapa = {};
  itensArray.forEach((item) => {
    if (!mapa[item.categoria]) mapa[item.categoria] = {};
    mapa[item.categoria][item.item] = item.status;
  });
  return mapa;
}

export default function ChecklistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const checklistCarregado = location.state?.checklistCarregado;

  const [carregando, setCarregando] = useState(!checklistCarregado);
  const [row, setRow] = useState(checklistCarregado?.row || null);
  const [avarias, setAvarias] = useState(checklistCarregado?.avarias || []);
  const [itensPorCategoria, setItensPorCategoria] = useState(
    checklistCarregado ? itensParaMapa(checklistCarregado.itens || []) : {},
  );
  const [imprimindo, setImprimindo] = useState(false);

  const [entregaObservacoes, setEntregaObservacoes] = useState('');
  const [entregaConferida, setEntregaConferida] = useState(false);
  const [assinaturaSaida, setAssinaturaSaida] = useState(null);
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [modalEntregaAberto, setModalEntregaAberto] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erroFinalizar, setErroFinalizar] = useState(null);

  const [os, setOs] = useState('');
  const [editandoOs, setEditandoOs] = useState(false);
  const [salvandoOs, setSalvandoOs] = useState(false);
  const [erroOs, setErroOs] = useState(null);

  useEffect(() => {
    oficinaApi.checklists
      .obter(id)
      .then(({ row: rowCarregado, itens, avarias: avariasCarregadas }) => {
        setRow(rowCarregado);
        setAvarias(avariasCarregadas || []);
        setItensPorCategoria(itensParaMapa(itens || []));
        setEntregaObservacoes(rowCarregado?.entrega_observacoes || '');
        setEntregaConferida(Boolean(rowCarregado?.entrega_conferida));
        setAssinaturaSaida(rowCarregado?.assinatura_saida || null);
        setOs(rowCarregado?.os || '');
      })
      .finally(() => setCarregando(false));
  }, [id]);

  const handleFinalizar = async () => {
    setFinalizando(true);
    setErroFinalizar(null);
    try {
      const rowAtualizado = await oficinaApi.checklists.finalizar(id, {
        entregaConferida,
        entregaObservacoes: entregaObservacoes || undefined,
        assinaturaSaida,
      });
      setRow(rowAtualizado);
      setModalEntregaAberto(false);
    } catch (error) {
      setErroFinalizar(error.message || 'Não foi possível finalizar o checklist.');
    } finally {
      setFinalizando(false);
    }
  };

  const handleSalvarOs = async () => {
    setSalvandoOs(true);
    setErroOs(null);
    try {
      const rowAtualizado = await oficinaApi.checklists.atualizar(id, { os: os || null });
      setRow(rowAtualizado);
      setEditandoOs(false);
    } catch (error) {
      setErroOs(error.message || 'Não foi possível salvar a O.S.');
    } finally {
      setSalvandoOs(false);
    }
  };

  if (carregando) {
    return <CarLoader inline />;
  }

  if (!row) {
    return <p className="text-sm text-muted-foreground">Checklist não encontrado.</p>;
  }

  if (imprimindo) {
    return (
      <ChecklistDocumento
        row={row}
        avarias={avarias}
        itensPorCategoria={itensPorCategoria}
        onVoltar={() => setImprimindo(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/oficina/checklists')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImprimindo(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Visualizar PDF
          </Button>
          {row.status === 'em_andamento' && !row.assinatura_entrada && user?.isOficinaInspetor && (
            <Button type="button" size="sm" onClick={() => navigate(`/oficina/checklists/${id}/editar`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
          {(row.status === 'avaliado' || (row.status === 'em_andamento' && row.assinatura_entrada)) && user?.isOficinaInspetor && (
            <Button type="button" size="sm" onClick={() => setModalEntregaAberto(true)}>
              Registrar Saída
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Checklist Nº {row.numero}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(row.data_entrada).toLocaleString('pt-BR')}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[row.status] || 'default'}>{STATUS_LABEL[row.status] || row.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p>{row.cliente_nome || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Veículo</p>
          <p>{[row.veiculo_modelo, row.veiculo_placa || row.veiculo_chassi].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Responsável</p>
          <p>{row.colaborador_nome || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">O.S.</p>
          {editandoOs ? (
            <div className="mt-1 flex items-center gap-2">
              <Input
                className="h-8"
                placeholder="O.S."
                autoFocus
                value={os}
                onChange={(e) => setOs(e.target.value)}
                onBlur={() => (os !== (row.os || '') ? handleSalvarOs() : setEditandoOs(false))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setOs(row.os || '');
                    setEditandoOs(false);
                  }
                }}
                disabled={salvandoOs}
              />
              {salvandoOs && <span className="text-xs text-muted-foreground">Salvando...</span>}
            </div>
          ) : (
            <p className="flex items-center gap-1.5">
              {row.os || '—'}
              {user?.isOficinaInspetor && (
                <button
                  type="button"
                  onClick={() => setEditandoOs(true)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Editar O.S."
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          )}
          {erroOs && <p className="mt-1 text-xs text-destructive">{erroOs}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Km</p>
          <p>{row.km ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unidade</p>
          <p>{row.unidade_nome || '—'}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Inspeção do veículo</h2>
        <AvariaMap avarias={avarias} readOnly />
      </div>

      {CATEGORIAS.map((categoria) => (
        <ChecklistItensList key={categoria} categoria={categoria} valores={itensPorCategoria[categoria] || {}} readOnly />
      ))}

      {row.observacoes && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Observações</p>
          <p className="text-sm">{row.observacoes}</p>
        </div>
      )}

      {Array.isArray(row.comunicacoes) && row.comunicacoes.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Comunicações eletrônicas autorizadas</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {row.comunicacoes.map((chave) => (
              <li key={chave}>{COMUNICACOES_LABEL[chave] || chave}</li>
            ))}
          </ul>
        </div>
      )}

      <FotoUploadGrid avaliacaoId={id} fotos={row.fotos || []} readOnly />

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Assinatura do responsável</p>
          {row.colaborador_assinatura_url ? (
            <div className="mt-2 inline-block rounded-md bg-white p-1">
              <img src={row.colaborador_assinatura_url} alt="Assinatura do responsável" className="h-16 object-contain" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Assinatura do cliente (Entrada)</p>
          {row.assinatura_entrada ? (
            <div className="mt-2 inline-block rounded-md bg-white p-1">
              <img src={row.assinatura_entrada} alt="Assinatura do cliente na entrada" className="h-16 object-contain" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Assinatura do cliente (Saída)</p>
          {row.assinatura_saida ? (
            <div className="mt-2 inline-block rounded-md bg-white p-1">
              <img src={row.assinatura_saida} alt="Assinatura do cliente na saída" className="h-16 object-contain" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      <Dialog open={modalEntregaAberto} onOpenChange={(open) => !open && setModalEntregaAberto(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entrega e Saída</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {erroFinalizar && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {erroFinalizar}
              </p>
            )}

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

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Assinatura do cliente (Saída)</p>
              {assinaturaSaida ? (
                <div className="mt-2 inline-block rounded-md bg-white p-1">
                  <img src={assinaturaSaida} alt="Assinatura do cliente na saída" className="h-16 object-contain" />
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Ainda não capturada.</p>
              )}
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setModalAssinaturaAberto(true)}>
                {assinaturaSaida ? 'Refazer assinatura' : 'Capturar assinatura'}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleFinalizar} disabled={finalizando || !assinaturaSaida}>
                {finalizando ? 'Finalizando...' : 'Finalizar avaliação'}
              </Button>
            </div>
          </div>

          <AssinaturaModal
            open={modalAssinaturaAberto}
            titulo="Assinatura do cliente na saída"
            onCancel={() => setModalAssinaturaAberto(false)}
            onConfirm={(dataUrl) => {
              setAssinaturaSaida(dataUrl);
              setModalAssinaturaAberto(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
