import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppUpdateNoticeDialog, applyTheme, getInitialTheme } from '@macom/ui';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import InstallPromptBanner from '@/components/layout/InstallPromptBanner';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/AuthContext';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.system_access_level === 'admin';

  const avisoQuery = useQuery({
    // Habilitado tambem para admin: em modo_teste, o backend so devolve o aviso pro proprio
    // criador (ver obterAvisoAtivo em _shared/avisos.ts) -- e assim que o admin consegue ver o
    // proprio aviso em teste antes de disparar pra todo mundo.
    queryKey: ['servicos', 'aviso-ativo', user?.id],
    queryFn: financeiroApi.avisos.getAtivo,
    enabled: Boolean(user?.id),
  });

  const aceitarAvisoMutation = useMutation({
    mutationFn: (avisoId) => financeiroApi.avisos.aceitar(avisoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servicos', 'aviso-ativo', user?.id] }),
  });

  const aviso = avisoQuery.data?.aviso || null;
  const versaoAceita = avisoQuery.data?.aceite?.versao_aceita ?? 0;
  // Admin fora de modo_teste nunca e bloqueado (o backend so retorna o aviso pra ele quando ele
  // mesmo o criou em modo teste, entao aqui basta checar obrigatorio/versao normalmente).
  const precisaAceitarAviso = Boolean(aviso) && aviso.obrigatorio !== false && versaoAceita < aviso.versao
    && !(isAdmin && !aviso.modo_teste);

  // Fecha o modal na hora do clique, sem esperar a resposta do servidor -- o aceite acontece em
  // segundo plano (com invalidacao da query se der certo). Guarda por `id + versao` pra o dialogo
  // voltar a aparecer se, por algum motivo (ex.: erro de rede), a mutation nao completar e o
  // usuario navegar de novo antes da query refletir o aceite.
  const [dispensado, setDispensado] = useState(null);
  const dispensadoAtual = aviso && dispensado?.id === aviso.id && dispensado?.versao === aviso.versao;

  function handleAceitarAviso() {
    setDispensado({ id: aviso.id, versao: aviso.versao });
    const requerAtualizacao = aviso.requer_atualizacao === true;
    aceitarAvisoMutation.mutate(aviso.id, {
      onSuccess: () => {
        if (requerAtualizacao) window.location.reload();
      },
    });
  }

  useEffect(() => {
    const saved = window.localStorage.getItem('servicos:sidebar-collapsed');
    setCollapsed(saved === null ? true : saved === 'true');
  }, []);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  };

  const handleToggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('servicos:sidebar-collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggleSidebar}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      <BottomNav onOpenMore={() => setMobileOpen(true)} />

      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col-reverse items-stretch gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]">
        <InstallPromptBanner />
      </div>

      <div className={`app-shell-content transition-all duration-300 ${collapsed ? 'lg:ml-[88px]' : 'lg:ml-64'}`}>
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />

        <main className="min-w-0 flex-1 px-4 py-6 pb-safe-bottom-nav md:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <AppUpdateNoticeDialog
        notice={precisaAceitarAviso && !dispensadoAtual ? aviso : null}
        onAccept={handleAceitarAviso}
        accepting={false}
      />
    </div>
  );
}
