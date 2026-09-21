import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { Badge, Button, MoneyLoader } from '@macom/ui';
import { formatValor, STATUS_LABEL, STATUS_VARIANT, toLocalDateOnly } from '@/lib/financeiroFormat';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dataChave(row) {
  return toLocalDateOnly(row.vencimento_efetivo || row.data_vencimento);
}

export default function CalendarioVencimentos() {
  const [mesReferencia, setMesReferencia] = useState(() => startOfMonth(new Date()));
  const [diaSelecionado, setDiaSelecionado] = useState(() => toLocalDateOnly(new Date()));

  const solicitacoesQuery = useQuery({
    queryKey: ['servicos', 'solicitacoes', 'calendario'],
    queryFn: async () => {
      const result = await financeiroApi.solicitacoes.list({ order_by: 'data_vencimento' });
      return (result || []).filter((row) => row.status === 'aprovado' || row.status === 'pago');
    },
  });
  const rows = solicitacoesQuery.data || [];
  const loading = solicitacoesQuery.isLoading;

  const rowsPorDia = useMemo(() => {
    const mapa = new Map();
    rows.forEach((row) => {
      const chave = dataChave(row);
      if (!chave) return;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(row);
    });
    return mapa;
  }, [rows]);

  const diasGrade = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesReferencia), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesReferencia), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesReferencia]);

  const itensDoDia = rowsPorDia.get(diaSelecionado) || [];
  const dataSelecionadaObj = diasGrade.find((dia) => toLocalDateOnly(dia) === diaSelecionado) || new Date(`${diaSelecionado}T00:00:00`);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays className="h-5 w-5" />
          Calendário de vencimentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Visão por dia das contas a pagar (aprovadas e pagas).
        </p>
      </div>

      {loading ? (
        <MoneyLoader inline />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold capitalize">
                {format(mesReferencia, 'MMMM yyyy', { locale: ptBR })}
              </h3>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMesReferencia((atual) => subMonths(atual, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMesReferencia((atual) => addMonths(atual, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {DIAS_SEMANA.map((dia) => (
                <div key={dia} className="py-1">{dia}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {diasGrade.map((dia) => {
                const chave = toLocalDateOnly(dia);
                const itens = rowsPorDia.get(chave) || [];
                const foraDoMes = !isSameMonth(dia, mesReferencia);
                const selecionado = chave === diaSelecionado;
                const todasPagas = itens.length > 0 && itens.every((item) => item.status === 'pago');
                const temAPagar = itens.some((item) => item.status !== 'pago');

                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => setDiaSelecionado(chave)}
                    className={`flex h-16 flex-col items-center justify-start gap-1 rounded-md border p-1 text-sm transition-colors ${
                      selecionado
                        ? 'border-transparent bg-foreground text-background'
                        : 'border-transparent hover:bg-muted'
                    } ${foraDoMes ? 'text-muted-foreground/40' : ''}`}
                  >
                    <span className={isToday(dia) && !selecionado ? 'font-bold' : ''}>{format(dia, 'd')}</span>
                    <div className="flex gap-0.5">
                      {todasPagas && (
                        <CheckCircle2 className={`h-3.5 w-3.5 ${selecionado ? 'text-background' : 'text-emerald-600'}`} />
                      )}
                      {temAPagar && (
                        <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${selecionado ? 'bg-background' : 'bg-foreground'}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                A pagar
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Pago
              </span>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-xs text-muted-foreground">Dia selecionado</p>
              <p className="text-lg font-semibold capitalize">
                {format(dataSelecionadaObj, "d 'de' MMMM", { locale: ptBR })}
              </p>
            </div>

            {itensDoDia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta neste dia.</p>
            ) : (
              <div className="space-y-2">
                {itensDoDia.map((row) => (
                  <div key={row.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status] || row.status}</Badge>
                      <span className={row.status === 'pago' ? 'text-muted-foreground line-through' : 'font-medium'}>
                        {formatValor(row.valor)}
                      </span>
                    </div>
                    <p className={`mt-1 ${row.status === 'pago' ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                      {row.titulo || row.fornecedor}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
