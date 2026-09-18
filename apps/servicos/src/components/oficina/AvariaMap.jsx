import { useState } from 'react';

import { AVARIA_TIPOS } from '@/lib/checklistItens';
import vehicleDiagram from '@/assets/oficina/vehicle-diagram.png';

function getPercentPoint(event, container) {
  const rect = container.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}

export default function AvariaMap({ avarias = [], onAdicionar, onRemover, readOnly = false }) {
  const [pontoPendente, setPontoPendente] = useState(null);

  const handleClickImagem = (event) => {
    if (readOnly) return;
    const { x, y } = getPercentPoint(event, event.currentTarget);
    setPontoPendente({ x, y });
  };

  const handleEscolherTipo = (tipo) => {
    if (!pontoPendente) return;
    onAdicionar?.({ tipo, pos_x: pontoPendente.x, pos_y: pontoPendente.y });
    setPontoPendente(null);
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

      <div className="relative w-full overflow-hidden rounded-lg border bg-white">
        <div
          className={readOnly ? 'relative' : 'relative cursor-crosshair'}
          onClick={handleClickImagem}
        >
          <img src={vehicleDiagram} alt="Diagrama do veículo" className="w-full select-none" draggable={false} />

          {avarias.map((avaria) => {
            const tipo = AVARIA_TIPOS.find((t) => t.key === avaria.tipo);
            return (
              <button
                key={avaria.id}
                type="button"
                disabled={readOnly}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!readOnly) onRemover?.(avaria.id);
                }}
                title={tipo?.label}
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10 text-sm font-bold text-destructive"
                style={{ left: `${avaria.pos_x}%`, top: `${avaria.pos_y}%` }}
              >
                {tipo?.simbolo || '?'}
              </button>
            );
          })}

          {pontoPendente && (
            <div
              className="absolute z-10 rounded-lg border bg-popover p-2 shadow-lg"
              style={{
                left: `${Math.min(85, Math.max(15, pontoPendente.x))}%`,
                top: `${Math.min(88, pontoPendente.y)}%`,
                transform: `translate(-50%, ${pontoPendente.y > 60 ? 'calc(-100% - 14px)' : '14px'})`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
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
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {avarias.length} avaria{avarias.length === 1 ? '' : 's'} registrada{avarias.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
