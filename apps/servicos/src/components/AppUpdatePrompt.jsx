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
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Falha ao registrar service worker', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast({
      title: 'Nova versão disponível',
      description: 'Atualize para ver as últimas mudanças do sistema.',
      duration: Infinity,
      action: (
        <ToastAction altText="Atualizar agora" onClick={() => updateServiceWorker(true)}>
          Atualizar
        </ToastAction>
      ),
    });
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
