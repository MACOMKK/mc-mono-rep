import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import { Dialog, DialogContent } from '@macom/ui';

export default function ImageLightbox({ fotos = [], index, onOpenChange }) {
  const [indiceAtual, setIndiceAtual] = useState(index);

  useEffect(() => {
    setIndiceAtual(index);
  }, [index]);

  const foto = indiceAtual != null ? fotos[indiceAtual] : null;
  const temVarias = fotos.length > 1;

  const legenda = [foto?.categoria, foto?.legenda].filter(Boolean).join(' — ');

  return (
    <Dialog open={foto != null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-5xl flex-col gap-2 p-2 sm:max-w-5xl">
        {foto && (
          <>
            <div className="relative h-[75vh] w-full overflow-hidden rounded-md bg-black/5">
              <TransformWrapper key={foto.url} initialScale={1} minScale={1} maxScale={6} centerOnInit doubleClick={{ mode: 'toggle' }}>
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
                  <img src={foto.url} alt={legenda || 'Foto do veículo'} className="h-[75vh] w-full object-contain" />
                </TransformComponent>
              </TransformWrapper>

              {temVarias && (
                <>
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    onClick={() => setIndiceAtual((atual) => (atual - 1 + fotos.length) % fotos.length)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    onClick={() => setIndiceAtual((atual) => (atual + 1) % fotos.length)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {legenda && <p className="text-center text-sm text-muted-foreground">{legenda}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
