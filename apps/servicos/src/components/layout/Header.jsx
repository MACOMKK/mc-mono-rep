import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BellRing, Download, Headset, Menu, Settings, UserRound } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  AccountMenu,
  AccountMenuItem,
  Button,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  ProfileViewDialog,
  useToast,
} from '@macom/ui';
import NotificationsBell from '@/components/NotificationsBell';
import { useAuth } from '@/lib/AuthContext';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { usePushBanner } from '@/lib/usePushBanner';

const ROLE_LABEL = {
  usuario: 'Usuário',
  aprovador: 'Aprovador',
  financeiro: 'Gerente',
};

// Numeros de contato dos responsaveis pelo suporte do sistema Servicos (WhatsApp) -- antes um
// botao flutuante fixo por cima do conteudo, movido pra dentro do menu de conta porque disputava
// espaco/z-index com o toast de atualizacao e o InstallPromptBanner no mesmo canto da tela.
const SUPPORT_CONTACTS = [
  { nome: 'Suporte I', telefone: '5591983927903' },
  { nome: 'Suporte II', telefone: '5591989566353' },
];

function buildWhatsAppLink(telefone) {
  return `https://wa.me/${telefone}`;
}

export default function Header({ onOpenMobileMenu }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { canInstall, promptInstall } = useInstallPrompt();
  const { canShowBanner: canShowPushButton, permission, loading, error: pushError, subscribe } = usePushBanner();
  const { toast } = useToast();
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (pushError) toast({ title: 'Erro', description: pushError.message, variant: 'destructive' });
  }, [pushError, toast]);

  const profileQuery = useQuery({
    queryKey: ['servicos', 'colaborador-profile', user?.id],
    queryFn: () => financeiroApi.colaboradores.getProfile(user.id),
    enabled: showProfile && Boolean(user?.id),
  });

  const showPushButton = canShowPushButton && permission !== 'denied';

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-card px-4 pt-safe will-change-transform [transform:translateZ(0)] sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileMenu}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        {showPushButton ? (
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            className="hidden items-center gap-2 rounded-full border border-primary px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60 sm:flex"
          >
            <BellRing className="h-3.5 w-3.5" />
            Ativar notificações
          </button>
        ) : null}

        {showPushButton ? (
          <button
            type="button"
            disabled={loading}
            onClick={subscribe}
            aria-label="Ativar notificações"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60 sm:hidden"
          >
            <BellRing className="h-4 w-4" />
          </button>
        ) : null}

        {canInstall ? (
          <button
            type="button"
            onClick={promptInstall}
            className="hidden items-center gap-2 rounded-full border border-primary px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:flex"
          >
            <Download className="h-3.5 w-3.5" />
            Instalar app
          </button>
        ) : null}

        {canInstall ? (
          <button
            type="button"
            onClick={promptInstall}
            aria-label="Instalar aplicativo"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
          >
            <Download className="h-4 w-4" />
          </button>
        ) : null}

        <NotificationsBell />

        <AccountMenu
          name={user?.name}
          subtitle={ROLE_LABEL[user?.role] || user?.role}
          photoUrl={user?.photoUrl}
          onLogout={() => logout()}
        >
          <AccountMenuItem icon={UserRound} onSelect={() => setShowProfile(true)}>
            Ver perfil
          </AccountMenuItem>
          {user?.system_access_level === 'admin' ? (
            <AccountMenuItem icon={Settings} onSelect={() => navigate('/configuracoes')}>
              Configurações
            </AccountMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3 rounded-none p-0 text-sm font-medium text-[#d7d7db] outline-none focus:bg-transparent focus:text-white data-[state=open]:bg-transparent data-[state=open]:text-white [&_svg]:text-[#8f9198]">
              <Headset className="h-4 w-4" />
              Suporte
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[180px] rounded-md border-[#3a3a3d] bg-[#242529] p-1 text-[#d7d7db] shadow-2xl">
              {SUPPORT_CONTACTS.map((contact) => (
                <DropdownMenuItem
                  key={contact.telefone}
                  onSelect={() => window.open(buildWhatsAppLink(contact.telefone), '_blank', 'noopener,noreferrer')}
                  className="rounded-sm px-2 py-1.5 text-sm text-[#d7d7db] focus:bg-[#3a3a3d] focus:text-white"
                >
                  {contact.nome}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </AccountMenu>

        <ProfileViewDialog
          open={showProfile}
          onOpenChange={setShowProfile}
          profile={profileQuery.data}
          loading={profileQuery.isLoading}
          error={profileQuery.error}
          isOwnProfile
          signatureSetupUrl="https://macom-intranet.vercel.app/perfil"
        />
      </div>
    </header>
  );
}
