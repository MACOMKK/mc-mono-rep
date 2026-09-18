import { useEffect, useRef, useState } from 'react';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@macom/ui';

const SIGNATURE_CANVAS_WIDTH = 600;
const SIGNATURE_CANVAS_HEIGHT = 220;

export default function AssinaturaModal({ open, onCancel, onConfirm, titulo = 'Assinatura do cliente' }) {
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
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    setIsEmpty(true);
  }, [open]);

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
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const handleConfirmar = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    onConfirm(canvas.toDataURL('image/png'));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Use o mouse ou o dedo (em telas touch) para desenhar a assinatura.
        </p>

        <canvas
          ref={canvasRef}
          width={SIGNATURE_CANVAS_WIDTH}
          height={SIGNATURE_CANVAS_HEIGHT}
          className="w-full touch-none rounded-xl border border-dashed border-input bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={handleClear}>
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmar} disabled={isEmpty}>
              Confirmar assinatura
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
