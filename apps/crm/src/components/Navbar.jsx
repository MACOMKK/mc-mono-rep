import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { crmDataClient } from '@/api/crmDataClient';
import {
  BarChart3,
  Calendar,
  CalendarDays,
  Car,
  ChevronDown,
  Columns3,
  DollarSign,
  FileText,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  Lock,
  LogOut,
  PieChart,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  Users,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEmpresa } from '@/context/EmpresaContext';
import { useAuth } from '@/lib/AuthContext';
import { useUnidadesEmpresa } from '@/hooks/useUnidadesEmpresa';
import { cn } from '@/lib/utils';

const MACOM_LOGO_URL = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';

function NavMenu({ label, items }) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-full items-center gap-1 border-b-2 border-transparent px-3 text-xs font-bold uppercase tracking-widest text-white/80 transition-colors hover:border-primary hover:text-white data-[state=open]:border-primary data-[state=open]:text-white">
        {label} <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-none border-0 p-0 shadow-2xl">
        <div className="border-b border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm font-bold uppercase tracking-widest text-white">
          {label}
        </div>
        {items ? items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={!item.path}
            className={cn(
              'gap-3 rounded-none px-4 py-3 text-xs font-semibold uppercase tracking-wider',
              item.path
                ? 'cursor-pointer hover:bg-red-50 hover:text-primary focus:bg-red-50 focus:text-primary'
                : 'cursor-not-allowed text-slate-400 opacity-70 focus:bg-transparent',
            )}
            onClick={() => item.path && navigate(item.path)}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm',
                item.path ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400',
              )}
            >
              {item.path ? <item.icon className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </span>
            {item.label}
            {item.badge > 0 ? (
              <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                {item.badge}
              </span>
            ) : null}
            {!item.path ? (
              <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-400">
                {item.comingSoon ? 'Em breve' : 'Sem acesso'}
              </span>
            ) : null}
          </DropdownMenuItem>
        )) : (
          <div className="flex flex-col items-center bg-white px-4 py-8 text-center">
            <Lock className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Sem acesso aos modulos</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Contate um administrador</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RealtimeIndicator({ realtime }) {
  const status = realtime?.status || 'disabled';
  const lastSyncedAt = realtime?.lastSyncedAt || null;
  const recentlySynced = lastSyncedAt && Date.now() - lastSyncedAt < 60000;

  const config = {
    active: {
      label: recentlySynced ? 'Atualizado agora' : 'Tempo real ativo',
      dot: 'bg-emerald-400',
      text: 'text-white/70',
      spin: false,
    },
    syncing: {
      label: 'Sincronizando...',
      dot: 'bg-amber-300',
      text: 'text-amber-100',
      spin: true,
    },
    connecting: {
      label: 'Conectando...',
      dot: 'bg-sky-300',
      text: 'text-sky-100',
      spin: true,
    },
    error: {
      label: 'Tempo real instavel',
      dot: 'bg-red-400',
      text: 'text-red-100',
      spin: false,
    },
    unavailable: {
      label: 'Tempo real indisponivel',
      dot: 'bg-slate-400',
      text: 'text-white/50',
      spin: false,
    },
    disabled: {
      label: 'Tempo real pausado',
      dot: 'bg-slate-400',
      text: 'text-white/50',
      spin: false,
    },
  }[status] || {
    label: 'Tempo real ativo',
    dot: 'bg-emerald-400',
    text: 'text-white/70',
    spin: false,
  };

  return (
    <div
      className={cn('hidden items-center gap-2 border-l border-white/10 pl-3 text-[10px] font-bold uppercase tracking-wider lg:flex', config.text)}
      title="Conexao em tempo real do CRM"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      <span>{config.label}</span>
      {config.spin ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
    </div>
  );
}

export default function Navbar({ realtime }) {
  const { empresa, setEmpresa } = useEmpresa();
  const { empresas } = useUnidadesEmpresa();
  const empresasFiltro = ['Todas', ...empresas];
  const { logout, user } = useAuth();
  const userInitial = (user?.name || user?.email || 'U').slice(0, 1).toUpperCase();

  const { data: atrasadasCount = 0 } = useQuery({
    queryKey: ['crm-atividades-atrasadas', empresa],
    queryFn: async () => {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const result = await crmDataClient.entities.Atividade.listPage({
        limit: 1,
        filters: {
          status: 'planejada',
          proximo_to: ontem.toISOString().slice(0, 10),
          ...(empresa !== 'Todas' ? { empresa } : {}),
        },
      });
      return result.count || 0;
    },
    refetchInterval: 60000,
  });

  return (
    <header className="bg-[#1a1a1a] px-6">
      <div className="flex h-14 items-center">
        <Link to="/leads" className="mr-6 flex shrink-0 items-center">
          <img src={MACOM_LOGO_URL} alt="MACOM" className="h-8 w-8 object-contain" />
          <span className="ml-2 text-sm font-black uppercase tracking-widest text-white">MACOM</span>
          <span className="mx-2 text-white/30">|</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-white/60">REVVO CRM</span>
        </Link>

        <nav className="hidden h-full items-center md:flex">
          <NavMenu label="Vendas" items={[
            { label: 'Agenda de Atividades', icon: Tag, path: '/atividades', badge: atrasadasCount },
            { label: 'Leads', icon: DollarSign, path: '/leads' },
            { label: 'Propostas', icon: FileText, path: '/propostas' },
            { label: 'Contatos e Clientes', icon: Users, path: '/clientes' },
            { label: 'Atendimento', icon: Headphones, path: '/atendimento' },
          ]} />
          <NavMenu label="Veículos" items={[
            { label: 'Estoque', icon: Columns3, path: '/estoque' },
            {
              label: 'Categorias de Veiculo',
              icon: Car,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/categorias-veiculo' : undefined,
            },
            {
              label: 'Marcas de Veiculo',
              icon: Car,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/marcas-veiculo' : undefined,
            },
            {
              label: 'Modelos de Veiculo',
              icon: Car,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/modelos-veiculo' : undefined,
            },
            {
              label: 'Versoes de Veiculo',
              icon: Car,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/versoes-veiculo' : undefined,
            },
          ]} />
          <NavMenu label="Pós-Vendas" items={[
            { label: 'Agenda Online', icon: Calendar, comingSoon: true },
            { label: 'Agenda V2', icon: CalendarDays, comingSoon: true },
            { label: 'Painel de Retenção', icon: PieChart, comingSoon: true },
          ]} />
          <NavMenu label="Marketing" items={null} />
          <NavMenu label="Gestão" items={[
            { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
            { label: 'Contatos e Clientes', icon: Users, path: '/clientes' },
            { label: "KPI's", icon: BarChart3, comingSoon: true },
            { label: 'Treinamentos', icon: GraduationCap, comingSoon: true },
          ]} />
          <NavMenu label="Configurações" items={[
            {
              label: 'Distribuicao de Leads',
              icon: SlidersHorizontal,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/distribuicao' : undefined,
            },
            {
              label: 'Pipelines',
              icon: SlidersHorizontal,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/pipelines' : undefined,
            },
            { label: 'Tipos de Atividade', icon: SlidersHorizontal, comingSoon: true },
            {
              label: 'Origens',
              icon: SlidersHorizontal,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/origens-lead' : undefined,
            },
            { label: 'Mídias', icon: SlidersHorizontal, comingSoon: true },
            { label: 'Modelos de Interesse', icon: SlidersHorizontal, comingSoon: true },
            {
              label: 'Motivos Insucesso',
              icon: SlidersHorizontal,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/motivos-insucesso' : undefined,
            },
            {
              label: 'Motivos Andamento',
              icon: SlidersHorizontal,
              path: user?.role === 'admin' || user?.role === 'manager' ? '/configuracoes/motivos-andamento' : undefined,
            },
            { label: 'Empresas', icon: SlidersHorizontal, comingSoon: true },
            { label: 'Temperatura', icon: SlidersHorizontal, comingSoon: true },
            { label: 'Tipo de Ação', icon: SlidersHorizontal, comingSoon: true },
          ]} />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <RealtimeIndicator realtime={realtime} />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:text-white">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-primary" />
              {empresa} <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-none border-0 p-0 shadow-2xl">
              <div className="border-b border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs font-bold uppercase tracking-widest text-white">Unidade</div>
              {empresasFiltro.map((item) => (
                <DropdownMenuItem
                  key={item}
                  className="cursor-pointer rounded-none px-4 py-2.5 text-xs font-semibold uppercase"
                  onClick={() => setEmpresa(item)}
                >
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white transition-colors hover:bg-primary/80">
              {userInitial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none">
              <DropdownMenuItem className="cursor-pointer gap-2 text-xs font-semibold uppercase" onClick={() => logout()}>
                <LogOut className="h-3.5 w-3.5" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
