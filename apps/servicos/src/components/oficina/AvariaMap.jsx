import { useRef, useState } from 'react';
import { Camera, Minus, Plus, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';

import { Spinner } from '@macom/ui';
import { AVARIA_TIPOS } from '@/lib/checklistItens';
import vehicleDiagram from '@/assets/oficina/vehicle-diagram.png';

function getPercentPoint(event, container) {
  const rect = container.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute right-2 top-2 z-20 flex flex-col gap-1">
      <button
        type="button"
        onClick={() => zoomIn()}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 shadow-sm hover:bg-muted"
        title="Aproximar"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => zoomOut()}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 shadow-sm hover:bg-muted"
        title="Afastar"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 shadow-sm hover:bg-muted"
        title="Restaurar zoom"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function AvariaMap({ avarias = [], onAdicionar, onRemover, onCapturarFotoAmassado, readOnly = false }) {
  const [pontoPendente, setPontoPendente] = useState(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const fotoInputRef = useRef(null);

  const handleClickImagem = (event) => {
    if (readOnly) return;
    const { x, y } = getPercentPoint(event, event.currentTarget);

    // Posição do popup é calculada em px relativos ao container externo
    // (fora da árvore com zoom/pan aplicado) -- ele se comporta como um menu
    // de contexto normal, sempre do mesmo tamanho, em vez de contra-escalar
    // junto com o diagrama (o que fazia o menu "dominar" a tela em zoom alto).
    const containerRect = containerRef.current.getBoundingClientRect();
    const rawScreenX = event.clientX - containerRect.left;
    const screenY = event.clientY - containerRect.top;
    const screenX = Math.min(containerRect.width - 90, Math.max(90, rawScreenX));
    const openAbove = screenY > containerRect.height / 2;

    setPontoPendente({ x, y, screenX, screenY, openAbove });
  };

  const handleEscolherTipo = async (tipo) => {
    if (!pontoPendente) return;
    const avariaCriada = await onAdicionar?.({ tipo, pos_x: pontoPendente.x, pos_y: pontoPendente.y });

    if (tipo === 'amassado' && avariaCriada?.id) {
      setPontoPendente((atual) => (atual ? { ...atual, aguardandoFoto: true, avariaId: avariaCriada.id, erroFoto: null } : atual));
    } else {
      setPontoPendente(null);
    }
  };

  const handleSelecionarFotoAmassado = async (event) => {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo || !pontoPendente?.avariaId) return;

    setPontoPendente((atual) => (atual ? { ...atual, enviandoFoto: true, erroFoto: null } : atual));
    try {
      await onCapturarFotoAmassado?.(pontoPendente.avariaId, arquivo);
      setPontoPendente(null);
    } catch (error) {
      setPontoPendente((atual) =>
        atual ? { ...atual, enviandoFoto: false, erroFoto: error.message || 'Não foi possível enviar a foto.' } : atual,
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Legenda de avarias</p>
        <div className="flex flex-wrap gap-2">
          {AVARIA_TIPOS.map((tipo) => (
            <span key={tipo.key} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive font-bold text-destructive-foreground">
                {tipo.simbolo}
              </span>
              {tipo.label}
            </span>
          ))}
        </div>
      </div>

      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          Toque sobre o desenho para registrar uma avaria. Toque em um marcador para removê-lo.
        </p>
      )}

      <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border bg-white">
        <TransformWrapper
          minScale={1}
          maxScale={4}
          initialScale={1}
          centerOnInit
          limitToBounds
          doubleClick={{ mode: 'zoomIn' }}
          wheel={{ activationKeys: ['Control', 'Meta'] }}
          onTransformed={(_, state) => {
            setZoom(state.scale);
            setPontoPendente((prev) => (prev ? null : prev));
          }}
        >
          <ZoomControls />
          <TransformComponent wrapperClass="!w-full" contentClass="!w-full">
            <div
              className={readOnly ? 'relative w-full' : 'relative w-full cursor-crosshair'}
              onClick={handleClickImagem}
            >
              <img src={vehicleDiagram} alt="Diagrama do veículo" className="w-full select-none" draggable={false} />

              {avarias.map((avaria) => {
                const tipo = AVARIA_TIPOS.find((t) => t.key === avaria.tipo);
                return (
                  <div
                    key={avaria.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${avaria.pos_x}%`, top: `${avaria.pos_y}%` }}
                  >
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!readOnly) onRemover?.(avaria.id);
                      }}
                      title={tipo?.label}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10 text-sm font-bold text-destructive"
                      style={{ transform: `scale(${1 / zoom})` }}
                    >
                      {tipo?.simbolo || '?'}
                    </button>
                  </div>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>

        {pontoPendente && (
          <div
            className="absolute z-10"
            style={{
              left: `${pontoPendente.screenX}px`,
              top: `${pontoPendente.screenY}px`,
              transform: `translate(-50%, ${pontoPendente.openAbove ? 'calc(-100% - 14px)' : '14px'})`,
            }}
          >
            <div className="rounded-lg border bg-popover p-2 shadow-lg" onClick={(event) => event.stopPropagation()}>
              {pontoPendente.aguardandoFoto ? (
                <div className="flex w-56 flex-col gap-2 py-1">
                  <p className="px-1 text-sm">Amassado registrado. Anexar uma foto deste ponto?</p>
                  {pontoPendente.erroFoto && <p className="px-1 text-xs text-destructive">{pontoPendente.erroFoto}</p>}
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleSelecionarFotoAmassado}
                  />
                  <button
                    type="button"
                    disabled={pontoPendente.enviandoFoto}
                    onClick={() => fotoInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {pontoPendente.enviandoFoto ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {pontoPendente.enviandoFoto ? 'Enviando...' : 'Tirar/Escolher foto'}
                  </button>
                  <button
                    type="button"
                    disabled={pontoPendente.enviandoFoto}
                    onClick={() => setPontoPendente(null)}
                    className="px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
                  >
                    Pular
                  </button>
                </div>
              ) : (
                <div className="flex min-w-[9.5rem] flex-col py-1">
                  {AVARIA_TIPOS.map((tipo) => (
                    <button
                      key={tipo.key}
                      type="button"
                      onClick={() => handleEscolherTipo(tipo.key)}
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="w-4 text-center font-bold text-destructive">{tipo.simbolo}</span>
                      {tipo.label}
                    </button>
                  ))}
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    onClick={() => setPontoPendente(null)}
                    className="px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {avarias.length} avaria{avarias.length === 1 ? '' : 's'} registrada{avarias.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
