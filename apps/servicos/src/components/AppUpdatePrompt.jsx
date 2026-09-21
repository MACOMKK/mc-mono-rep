import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ToastAction, useToast } from '@macom/ui';

// Registro manual do service worker (injectRegister: false em vite.config.js) pra controlar
// quando avisar sobre versao nova -- reload automatico e silencioso pode interromper o usuario
// no meio de uma acao (form, upload de anexo, aprovacao/pagamento em curso).
export default function AppUpdatePrompt() {
  const { toast } = useToast();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, 10 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Falha ao registrar service worker', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    let cancelado = false;

    // Busca fora do cache do SW pra pegar o version.json do deploy que acabou de virar disponivel
    // (o numero da versao nova so existe dentro do bundle novo, que so roda apos o reload) -- se
    // falhar (rede, deploy antigo sem o arquivo), o toast segue sem o numero, sem bloquear o fluxo.
    fetch('/version.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelado) return;
        const versao = data?.version || null;

        toast({
          title: 'Nova versão disponível',
          description: versao
            ? `Versão v${versao} pronta. Atualize para ver as últimas mudanças do sistema.`
            : 'Atualize para ver as últimas mudanças do sistema.',
          duration: Infinity,
          className: 'border-primary bg-primary text-primary-foreground',
          action: (
            <ToastAction
              altText="Atualizar agora"
              className="cursor-pointer border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground hover:text-primary"
              onClick={() => updateServiceWorker(true)}
            >
              Atualizar
            </ToastAction>
          ),
        });
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
