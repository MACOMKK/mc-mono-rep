import { useEffect, useState } from 'react';
import { LocateFixed, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ESTADO_INICIAL = { nome: '', endereco: '', latitude: '', longitude: '' };

// Enviar a localizacao de fato (coordenadas reais) pro cliente -- ex.: mandar o endereco da loja.
// "Usar minha localizacao atual" usa a geolocalizacao do proprio navegador do atendente (precisa
// de permissao do site); quem nao quiser/puder usar pode digitar lat/long manualmente (ex.: copiado
// de um link do Google Maps).
export default function EnviarLocalizacaoDialog({ open, onOpenChange, onEnviar, isPending }) {
  const [form, setForm] = useState(ESTADO_INICIAL);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  useEffect(() => {
    if (open) setForm(ESTADO_INICIAL);
  }, [open]);

  const handleUsarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Geolocalização não suportada neste navegador', variant: 'destructive' });
      return;
    }
    setBuscandoLocalizacao(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setBuscandoLocalizacao(false);
        setForm((atual) => ({
          ...atual,
          latitude: String(posicao.coords.latitude),
          longitude: String(posicao.coords.longitude),
        }));
      },
      () => {
        setBuscandoLocalizacao(false);
        toast({
          title: 'Não foi possível obter sua localização',
          description: 'Verifique a permissão de localização do navegador para este site.',
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const latitude = Number(form.latitude.replace(',', '.'));
  const longitude = Number(form.longitude.replace(',', '.'));
  const coordenadasValidas =
    form.latitude.trim() !== '' && form.longitude.trim() !== '' && Number.isFinite(latitude) && Number.isFinite(longitude);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!coordenadasValidas) return;
    onEnviar({
      latitude,
      longitude,
      nome: form.nome.trim(),
      endereco: form.endereco.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar localização</DialogTitle>
          <DialogDescription>Compartilhe um ponto no mapa com o cliente (ex.: endereço da loja).</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Button type="button" variant="outline" size="sm" disabled={buscandoLocalizacao} onClick={handleUsarLocalizacaoAtual}>
            <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
            {buscandoLocalizacao ? 'Obtendo localização...' : 'Usar minha localização atual'}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input
                value={form.latitude}
                onChange={(event) => setForm((atual) => ({ ...atual, latitude: event.target.value }))}
                placeholder="-23.5505"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input
                value={form.longitude}
                onChange={(event) => setForm((atual) => ({ ...atual, longitude: event.target.value }))}
                placeholder="-46.6333"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome do local (opcional)</Label>
            <Input
              value={form.nome}
              onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
              placeholder="Ex.: Macom Veículos"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Endereço (opcional)</Label>
            <Input
              value={form.endereco}
              onChange={(event) => setForm((atual) => ({ ...atual, endereco: event.target.value }))}
              placeholder="Ex.: Av. Principal, 123"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!coordenadasValidas || isPending}>
              <SendHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
