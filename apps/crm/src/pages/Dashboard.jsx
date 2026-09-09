import { crmDataClient } from '@/api/crmDataClient';
import { useQuery } from '@tanstack/react-query';
import { Tag, DollarSign, ThumbsUp, Users, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useEmpresa } from '@/context/EmpresaContext';

const CORES_STATUS = ['#94a3b8', '#3b82f6', '#16a34a', '#E30613'];
const STATUS_ATIVIDADES = ['planejada', 'concluida', 'cancelada'];
const FUNIL_STATUSES = ['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'proposta', 'convertido', 'perdido'];

async function countEntity(repository, filters = {}) {
  const result = await repository.listPage({
    limit: 1,
    filters,
  });
  return result.count || 0;
}

export default function Dashboard() {
  const { empresa } = useEmpresa();
  const baseFilters = empresa !== 'Todas' ? { empresa } : {};

  const { data: origensLead = [] } = useQuery({
    queryKey: ['crm-origens-lead'],
    queryFn: () => crmDataClient.entities.OrigemLead.list('nome'),
  });

  const { data: metrics = {
    atividadesTotal: 0,
    clientesTotal: 0,
    leadsConvertidos: 0,
    leadsTotal: 0,
    origemCounts: {},
    statusCounts: {},
  }, isFetching, isError, error } = useQuery({
    queryKey: ['dashboard-metrics', { empresa }, origensLead],
    enabled: origensLead.length > 0,
    queryFn: async () => {
      const [
        clientesTotal,
        leadsTotal,
        leadsConvertidos,
        atividadesTotal,
        statusResults,
        origemResults,
      ] = await Promise.all([
        countEntity(crmDataClient.entities.Cliente, baseFilters),
        countEntity(crmDataClient.entities.Lead, { ...baseFilters, status: FUNIL_STATUSES }),
        countEntity(crmDataClient.entities.Lead, { ...baseFilters, status: 'convertido' }),
        countEntity(crmDataClient.entities.Atividade, baseFilters),
        Promise.all(STATUS_ATIVIDADES.map((status) => (
          countEntity(crmDataClient.entities.Atividade, { ...baseFilters, status })
            .then((count) => [status, count])
        ))),
        Promise.all(origensLead.map((origem) => (
          countEntity(crmDataClient.entities.Lead, { ...baseFilters, origem_id: origem.id })
            .then((count) => [origem.nome, count])
        ))),
      ]);

      return {
        atividadesTotal,
        clientesTotal,
        leadsConvertidos,
        leadsTotal,
        origemCounts: Object.fromEntries(origemResults),
        statusCounts: Object.fromEntries(statusResults),
      };
    },
  });

  const statusData = [
    { name: 'Planejadas', value: metrics.statusCounts.planejada || 0 },
    { name: 'Concluidas', value: metrics.statusCounts.concluida || 0 },
    { name: 'Canceladas', value: metrics.statusCounts.cancelada || 0 },
  ];

  const origemData = origensLead.map((origem) => ({
    name: origem.nome,
    total: metrics.origemCounts[origem.nome] || 0,
  }));

  const taxaConversao = metrics.leadsTotal > 0
    ? Math.round((metrics.leadsConvertidos / metrics.leadsTotal) * 100)
    : 0;

  const cards = [
    { label: 'Contatos', value: metrics.clientesTotal, icon: Users, color: 'text-[#1a1a1a]', border: 'border-l-[#1a1a1a]' },
    { label: 'Leads', value: metrics.leadsTotal, icon: DollarSign, color: 'text-blue-600', border: 'border-l-blue-600' },
    { label: 'Atividades', value: metrics.atividadesTotal, icon: Tag, color: 'text-primary', border: 'border-l-primary' },
    { label: 'Leads Convertidos', value: metrics.leadsConvertidos, icon: ThumbsUp, color: 'text-green-600', border: 'border-l-green-600' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5">
      <div className="mb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Dashboard</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
          Indicadores gerais {isFetching ? 'sincronizando...' : ''}
        </p>
      </div>

      {isError ? (
        <div className="mb-6 border border-dashed border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-red-700">
          {error?.message || 'Nao foi possivel carregar os indicadores do dashboard.'}
        </div>
      ) : null}

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className={`bg-white shadow-sm border-l-4 ${c.border} p-5 flex items-center justify-between`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{c.label}</p>
              <p className="text-3xl font-black mt-1">{c.value}</p>
            </div>
            <c.icon className={`w-9 h-9 ${c.color} opacity-20`} />
          </div>
        ))}
      </div>

      {/* Taxa de conversao */}
      <div className="bg-[#1a1a1a] text-white p-5 mb-6 flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Taxa de Conversao de Leads</p>
          <p className="text-4xl font-black mt-1">{taxaConversao}%</p>
        </div>
        <TrendingUp className="w-12 h-12 text-primary opacity-60" />
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white shadow-sm">
          <div className="bg-[#1a1a1a] px-5 py-3">
            <p className="text-white text-[11px] font-bold uppercase tracking-widest">Atividades por Status</p>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {statusData.map((_, i) => <Cell key={i} fill={CORES_STATUS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white shadow-sm">
          <div className="bg-[#1a1a1a] px-5 py-3">
            <p className="text-white text-[11px] font-bold uppercase tracking-widest">Leads por Origem</p>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={origemData} barCategoryGap="35%">
                <XAxis dataKey="name" fontSize={10} fontWeight={700} tickLine={false} axisLine={false} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                <YAxis allowDecimals={false} fontSize={10} fontWeight={700} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                <Bar dataKey="total" fill="#E30613" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
