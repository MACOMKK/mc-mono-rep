import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Building2,
  CalendarClock,
  Clock,
  Hourglass,
  PieChart as PieChartIcon,
  Receipt,
  RotateCcw,
  SearchX,
  Tag,
  TrendingUp,
  UserSquare2,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  Badge,
  Button,
  Input,
  MoneyLoader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@macom/ui';
import { useCatalogosSolicitacao } from '@/hooks/useCatalogos';
import { formatValor, formatDataVencimento, getVencimentoInfo, STATUS_LABEL } from '@/lib/financeiroFormat';

const FILTRO_TODOS = 'todos';
const VENCIMENTOS_POR_PAGINA = 6;

const VIZ_BLUE = '#2a78d6';

// Cores fixas por status -- mesmo significado usado em STATUS_VARIANT (badges): pendente em
// alerta, aprovado em sucesso, pago em azul (mesma cor "info" dos badges), reprovado em critico,
// cancelado neutro. Nunca e a unica forma de distinguir o status: sempre acompanha o nome via
// legenda/tooltip/tabela.
const STATUS_CHART_COLOR = {
  pendente: '#fab219',
  aprovado: '#0ca30c',
  pago: VIZ_BLUE,
  reprovado: '#d03b3b',
  cancelado: '#898781',
};

// Tons suaves reaproveitando a mesma familia de cor dos badges de status (emerald/blue/amber/
// destructive), so que em versao "tint" (fundo claro + texto forte) pros cartoes de resumo --
// mantem a paleta do app em vez de inventar cores novas.
const TONE_CLASSNAMES = {
  neutral: 'bg-muted text-foreground',
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

const MES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatMesLabel(mes) {
  const [ano, mesNum] = String(mes || '').split('-');
  const indice = Number(mesNum) - 1;
  if (!ano || Number.isNaN(indice) || indice < 0 || indice > 11) return mes;
  return `${MES_LABEL[indice]}/${ano.slice(2)}`;
}

function HeroStat({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSNAMES[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate text-3xl font-bold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${TONE_CLASSNAMES[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold text-foreground">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ValorTooltip({ active, payload, label, nameFor }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((item) => (
          <div key={item.dataKey || item.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || item.payload?.fill }} />
            <span className="text-muted-foreground">{nameFor ? nameFor(item) : item.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{formatValor(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Generico o suficiente pra qualquer ranking "nome x valor" em barras horizontais (categoria,
// pendencia de pagamento por setor etc.) -- so muda o dataKey do eixo Y.
function HorizontalValorBarChart({ data, dataKey }) {
  const altura = Math.max(180, data.length * 38);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tickFormatter={(valor) => formatValor(valor)}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey={dataKey}
          width={110}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ValorTooltip />} />
        <Bar dataKey="valor" fill={VIZ_BLUE} radius={[0, 4, 4, 0]} barSize={18}>
          {/* So a linha com maior valor (primeira, ja vem ordenada desc do backend) ganha
              rotulo direto -- rotular todas vira ruido; o resto fica no eixo/tooltip. */}
          <LabelList
            dataKey="valor"
            content={({ x, y, width, height, index, value }) => {
              if (index !== 0) return null;
              return (
                <text
                  x={x + width + 8}
                  y={y + height / 2}
                  dy={4}
                  fontSize={12}
                  fontWeight={600}
                  fill="hsl(var(--foreground))"
                >
                  {formatValor(value)}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bloco de ranking simples (posicao, nome, quantidade, valor) usado pras 3 colunas de
// "Rankings" do dashboard -- Requisicoes por Setor / por Unidade / Pendencias por Diretor(a).
function RankingCard({ title, icon, rows, nameKey }) {
  return (
    <ChartCard title={title} icon={icon}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{title}</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row[nameKey]}>
                  <TableCell className="text-xs text-muted-foreground">{index + 1}º</TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm">{row[nameKey]}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{row.quantidade}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">{formatValor(row.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ChartCard>
  );
}

function StatusDonutChart({ data, total }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valor"
          nameKey="status"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={2}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        >
          {data.map((item) => (
            <Cell key={item.status} fill={STATUS_CHART_COLOR[item.status] || '#898781'} />
          ))}
          <Label
            position="center"
            content={({ viewBox }) => {
              const { cx, cy } = viewBox;
              return (
                <text x={cx} y={cy} textAnchor="middle">
                  <tspan x={cx} y={cy - 8} fontSize={10} fontWeight={600} letterSpacing="0.05em" fill="hsl(var(--muted-foreground))">
                    TOTAL
                  </tspan>
                  <tspan x={cx} y={cy + 12} fontSize={15} fontWeight={700} fill="hsl(var(--foreground))">
                    {formatValor(total)}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
        <Tooltip content={<ValorTooltip nameFor={(item) => STATUS_LABEL[item.payload.status] || item.payload.status} />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value, entry) => (
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[entry.payload.status] || value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EvolucaoMensalChart({ data }) {
  const formatted = data.map((item) => ({ ...item, mesLabel: formatMesLabel(item.mes) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={formatted} margin={{ top: 4, right: 8, bottom: 4, left: 4 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="mesLabel"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(valor) => formatValor(valor)}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ValorTooltip />} />
        <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
        <Bar dataKey="valor_solicitado" name="Solicitado" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} barSize={16} />
        <Bar dataKey="valor_pago" name="Pago" fill={VIZ_BLUE} radius={[4, 4, 0, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Relatorios() {
  const { data: catalogos } = useCatalogosSolicitacao();
  const empresas = catalogos?.empresas || [];
  const unidades = catalogos?.unidades || [];
  const departamentos = catalogos?.departamentos || [];
  const aprovadores = catalogos?.aprovadores || [];
  const colaboradores = catalogos?.colaboradores || [];

  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState(FILTRO_TODOS);
  const [unidadeFiltro, setUnidadeFiltro] = useState(FILTRO_TODOS);
  const [setorFiltro, setSetorFiltro] = useState(FILTRO_TODOS);
  const [solicitanteFiltro, setSolicitanteFiltro] = useState(FILTRO_TODOS);
  const [diretorFiltro, setDiretorFiltro] = useState(FILTRO_TODOS);
  const [paginaVencimentos, setPaginaVencimentos] = useState(0);

  const temFiltroAtivo = Boolean(
    dataDe ||
      dataAte ||
      empresaFiltro !== FILTRO_TODOS ||
      unidadeFiltro !== FILTRO_TODOS ||
      setorFiltro !== FILTRO_TODOS ||
      solicitanteFiltro !== FILTRO_TODOS ||
      diretorFiltro !== FILTRO_TODOS,
  );

  const limparFiltros = () => {
    setDataDe('');
    setDataAte('');
    setEmpresaFiltro(FILTRO_TODOS);
    setUnidadeFiltro(FILTRO_TODOS);
    setSetorFiltro(FILTRO_TODOS);
    setSolicitanteFiltro(FILTRO_TODOS);
    setDiretorFiltro(FILTRO_TODOS);
    setPaginaVencimentos(0);
  };

  const filtros = {
    de: dataDe || undefined,
    ate: dataAte || undefined,
    empresa_id: empresaFiltro !== FILTRO_TODOS ? empresaFiltro : undefined,
    unidade_id: unidadeFiltro !== FILTRO_TODOS ? unidadeFiltro : undefined,
    departamento_id: setorFiltro !== FILTRO_TODOS ? setorFiltro : undefined,
    solicitante_id: solicitanteFiltro !== FILTRO_TODOS ? solicitanteFiltro : undefined,
    aprovador_destino_id: diretorFiltro !== FILTRO_TODOS ? diretorFiltro : undefined,
  };

  const relatorioQuery = useQuery({
    queryKey: [
      'servicos',
      'relatorios',
      'financeiro',
      dataDe,
      dataAte,
      empresaFiltro,
      unidadeFiltro,
      setorFiltro,
      solicitanteFiltro,
      diretorFiltro,
    ],
    queryFn: () => financeiroApi.relatorios.financeiro(filtros),
  });

  const resumo = relatorioQuery.data?.resumo;
  const porCategoria = relatorioQuery.data?.porCategoria || [];
  const porStatus = relatorioQuery.data?.porStatus || [];
  const porSetor = relatorioQuery.data?.porSetor || [];
  const porUnidade = relatorioQuery.data?.porUnidade || [];
  const porDiretor = relatorioQuery.data?.porDiretor || [];
  const pendenciaPagamentoPorSetor = relatorioQuery.data?.pendenciaPagamentoPorSetor || [];
  const proximosVencimentos = relatorioQuery.data?.proximosVencimentos || [];
  const porMes = relatorioQuery.data?.porMes || [];
  const loading = relatorioQuery.isLoading;

  const totalPaginasVencimentos = Math.max(1, Math.ceil(proximosVencimentos.length / VENCIMENTOS_POR_PAGINA));
  const vencimentosPagina = useMemo(() => {
    const inicio = paginaVencimentos * VENCIMENTOS_POR_PAGINA;
    return proximosVencimentos.slice(inicio, inicio + VENCIMENTOS_POR_PAGINA);
  }, [proximosVencimentos, paginaVencimentos]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Monitoramento de Requisições Financeiras</h2>
        <p className="text-sm text-muted-foreground">
          Visão geral das solicitações de pagamento por período. O período considera a data em que
          a solicitação foi criada.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Input type="date" value={dataDe} onChange={(event) => setDataDe(event.target.value)} aria-label="Período de" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={dataAte} onChange={(event) => setDataAte(event.target.value)} aria-label="Período até" />
          </div>

          <div className="w-48">
            <Select value={solicitanteFiltro} onValueChange={setSolicitanteFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Solicitante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos solicitantes</SelectItem>
                {colaboradores.map((colaborador) => (
                  <SelectItem key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={diretorFiltro} onValueChange={setDiretorFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Diretoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas diretorias</SelectItem>
                {aprovadores.map((aprovador) => (
                  <SelectItem key={aprovador.id} value={aprovador.id}>
                    {aprovador.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select value={setorFiltro} onValueChange={setSetorFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos setores</SelectItem>
                {departamentos.map((departamento) => (
                  <SelectItem key={departamento.id} value={departamento.id}>
                    {departamento.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas unidades</SelectItem>
                {unidades.map((unidade) => (
                  <SelectItem key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={empresaFiltro} onValueChange={setEmpresaFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas empresas</SelectItem>
                {empresas.map((empresa) => (
                  <SelectItem key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {temFiltroAtivo && (
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <MoneyLoader inline />
      ) : !resumo || Number(resumo.total_quantidade) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-14 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhuma solicitação encontrada</p>
          <p className="text-xs text-muted-foreground">Ajuste o período ou os filtros acima e tente novamente.</p>
        </div>
      ) : (
        <>
          {/* Indicadores principais -- espelham os 4 cards do dashboard de referencia. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeroStat
              icon={Receipt}
              label="Total de solicitações"
              value={resumo.total_quantidade}
              hint={`Valor total ${formatValor(resumo.total_valor)}`}
              tone="neutral"
            />
            <HeroStat
              icon={Hourglass}
              label="Pendências de análise da diretoria"
              value={resumo.total_pendentes}
              hint={`Valor total ${formatValor(resumo.total_pendentes_valor)}`}
              tone="amber"
            />
            <HeroStat
              icon={Clock}
              label="Pendências de pagamento"
              value={resumo.total_aprovadas}
              hint={`Valor total ${formatValor(resumo.total_em_aberto)}`}
              tone="blue"
            />
            <HeroStat
              icon={Wallet}
              label="Total pago"
              value={formatValor(resumo.total_pago)}
              hint={`${resumo.total_pagas} solicitação(ões) pagas no período`}
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile
              icon={AlertTriangle}
              label="Atrasadas"
              value={formatValor(resumo.valor_atrasadas)}
              hint={`${resumo.total_atrasadas} solicitação(ões)`}
              tone="red"
            />
            <KpiTile icon={XCircle} label="Reprovadas" value={resumo.total_reprovadas} tone="slate" />
            <KpiTile icon={Ban} label="Canceladas" value={resumo.total_canceladas} tone="slate" />
          </div>

          {/* Rankings -- Requisicoes por Setor / por Unidade / Pendencias por Diretor(a). */}
          <div className="grid gap-4 lg:grid-cols-3">
            <RankingCard title="Requisições por Setor" icon={Building2} rows={porSetor} nameKey="setor" />
            <RankingCard title="Requisições por Unidade" icon={Building2} rows={porUnidade} nameKey="unidade" />
            <RankingCard title="Pendências por Diretor(a)" icon={UserSquare2} rows={porDiretor} nameKey="diretor" />
          </div>

          {/* Analises -- pendencias de pagamento por setor + evolucao mensal solicitado x pago. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Pendências de Pagamento por Setor" subtitle="Aprovadas, ainda não pagas" icon={Clock}>
              {pendenciaPagamentoPorSetor.length > 0 ? (
                <HorizontalValorBarChart data={pendenciaPagamentoPorSetor} dataKey="setor" />
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">Sem pendências de pagamento no período.</p>
              )}
            </ChartCard>

            <ChartCard title="Evolução Mensal" subtitle="Solicitado x pago, por mês de criação" icon={TrendingUp}>
              {porMes.length > 0 ? (
                <EvolucaoMensalChart data={porMes} />
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">Sem dados no período.</p>
              )}
            </ChartCard>
          </div>

          {/* Tabela analitica -- proximos vencimentos das solicitacoes aprovadas aguardando pagamento. */}
          <ChartCard title="Requisições Pendentes — Próximos Vencimentos" icon={CalendarClock}>
            {proximosVencimentos.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma pendência de pagamento no período.</p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Solicitação</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Diretor(a)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vencimentosPagina.map((linha) => {
                        const vencimentoInfo = getVencimentoInfo(linha.vencimento_efetivo);
                        return (
                          <TableRow key={linha.numero}>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              #{linha.numero} — {linha.titulo}
                            </TableCell>
                            <TableCell className="text-sm">{linha.solicitante_nome}</TableCell>
                            <TableCell className="text-sm">{linha.departamento_nome || '-'}</TableCell>
                            <TableCell className="text-sm">{linha.unidade_nome || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={vencimentoInfo.variant}>{formatDataVencimento(linha.vencimento_efetivo)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{linha.aprovador_destino_nome || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="info">Aguardando pagamento</Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">{formatValor(linha.valor)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPaginasVencimentos > 1 && (
                  <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
                    <span>
                      {paginaVencimentos * VENCIMENTOS_POR_PAGINA + 1}-
                      {Math.min((paginaVencimentos + 1) * VENCIMENTOS_POR_PAGINA, proximosVencimentos.length)} de{' '}
                      {proximosVencimentos.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={paginaVencimentos === 0}
                      onClick={() => setPaginaVencimentos((atual) => Math.max(0, atual - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={paginaVencimentos >= totalPaginasVencimentos - 1}
                      onClick={() => setPaginaVencimentos((atual) => Math.min(totalPaginasVencimentos - 1, atual + 1))}
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            {porCategoria.length > 0 && (
              <ChartCard title="Por categoria" subtitle="Valor solicitado, exclui reprovadas e canceladas" icon={Tag}>
                <HorizontalValorBarChart data={porCategoria} dataKey="categoria" />
              </ChartCard>
            )}

            {porStatus.length > 0 && (
              <ChartCard title="Por status" subtitle="Distribuição do valor total por status" icon={PieChartIcon}>
                <StatusDonutChart data={porStatus} total={resumo.total_valor} />
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
