'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 220;

// Modal de assinatura por canvas (desenho via mouse/touch), pra qualquer app que precise deixar o
// colaborador cadastrar a propria assinatura (ex.: apps/servicos, alem da ja existente em
// apps/intranet/src/pages/Profile.jsx, que mantem sua propria copia local por ja estar em
// producao). onConfirm recebe um File PNG pronto pra upload.
export function SignaturePadModal({ open, onCancel, onConfirm, isProcessing }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    setIsEmpty(true);
  }, [open]);

  if (!open) return null;

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    setIsEmpty(false);
  };

  const handlePointerUp = (event) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], 'assinatura.png', { type: 'image/png' }));
    }, 'image/png');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-950">Desenhar assinatura</h2>
          <p className="mt-1 text-sm text-slate-500">Use o mouse ou o dedo (em telas touch) para desenhar sua assinatura.</p>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            disabled={isProcessing}
          >
            Limpar
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50"
              disabled={isProcessing}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="h-10 rounded-xl bg-[#E30613] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c80510] disabled:opacity-70"
              disabled={isEmpty || isProcessing}
            >
              {isProcessing ? 'Enviando...' : 'Salvar assinatura'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default SignaturePadModal;
