import { useEffect, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TEXTO_PADRAO = 'Poderia compartilhar sua localização, por favor?';

// Pede pro CLIENTE compartilhar a localizacao dele (mensagem interativa "location_request_message",
// so' existe na Meta Cloud API -- ver guard de provedor em send_atendimento_mensagem/MensagemComposer).
// O cliente ve um botao nativo do WhatsApp "Enviar localizacao"; a resposta chega como uma mensagem
// de localizacao normal (tratada no webhook, mesmo caminho de uma localizacao enviada por conta
// propria).
export default function SolicitarLocalizacaoDialog({ open, onOpenChange, onEnviar, isPending }) {
  const [texto, setTexto] = useState(TEXTO_PADRAO);

  useEffect(() => {
    if (open) setTexto(TEXTO_PADRAO);
  }, [open]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const textoTrim = texto.trim();
    if (!textoTrim) return;
    onEnviar({ texto: textoTrim });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar localização</DialogTitle>
          <DialogDescription>
            O cliente recebe um botão do WhatsApp para compartilhar a localização dele. Só funciona na API oficial
            (Meta).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea value={texto} onChange={(event) => setTexto(event.target.value)} rows={3} className="resize-none" />

          <DialogFooter>
            <Button type="submit" disabled={!texto.trim() || isPending}>
              <SendHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
