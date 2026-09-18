import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Printer } from 'lucide-react';

import { Badge, Button, Spinner } from '@macom/ui';
import { oficinaApi } from '@macom/api-client/oficinaApi';
import { useAuth } from '@/lib/AuthContext';
import AvariaMap from '@/components/oficina/AvariaMap';
import ChecklistItensList from '@/components/oficina/ChecklistItensList';
import FotoUploadGrid from '@/components/oficina/FotoUploadGrid';
import ChecklistDocumento from '@/pages/oficina/ChecklistDocumento';

const STATUS_LABEL = { em_andamento: 'Em andamento', finalizado: 'Finalizado' };
const STATUS_VARIANT = { em_andamento: 'warning', finalizado: 'success' };
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
  const { user } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [row, setRow] = useState(null);
  const [avarias, setAvarias] = useState([]);
  const [itensPorCategoria, setItensPorCategoria] = useState({});
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    oficinaApi.checklists
      .obter(id)
      .then(({ row: rowCarregado, itens, avarias: avariasCarregadas }) => {
        setRow(rowCarregado);
        setAvarias(avariasCarregadas || []);
        setItensPorCategoria(itensParaMapa(itens || []));
      })
      .finally(() => setCarregando(false));
  }, [id]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
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
            Imprimir
          </Button>
          {row.status === 'em_andamento' && user?.isOficinaInspetor && (
            <Button type="button" size="sm" onClick={() => navigate(`/oficina/checklists/${id}/editar`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
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
          <p>{row.os || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Km</p>
          <p>{row.km ?? '—'}</p>
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

      <div className="grid grid-cols-2 gap-4">
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
          <p className="text-xs text-muted-foreground">Assinatura do cliente</p>
          {row.assinatura_cliente ? (
            <div className="mt-2 inline-block rounded-md bg-white p-1">
              <img src={row.assinatura_cliente} alt="Assinatura do cliente" className="h-16 object-contain" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
