import React, { useRef, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@macom/ui';
import { getImageFocusStyle } from '@/lib/announcementImage';

const PREVIEWS = [
  { label: 'Lista de avisos', aspect: 'aspect-[6/1]' },
  { label: 'Carrossel da Home', aspect: 'aspect-[4/1]' },
  { label: 'Detalhe do aviso', aspect: 'aspect-[5/2]' },
];

function clampPercent(value) {
  return Math.round(Math.min(Math.max(value, 0), 100) * 100) / 100;
}

export default function ImageFocusPicker({ open, imageUrl, initialFocus, onCancel, onConfirm }) {
  const imageRef = useRef(null);
  const draggingRef = useRef(false);
  const [focus, setFocus] = useState({
    x: initialFocus?.x ?? 50,
    y: initialFocus?.y ?? 50,
  });

  const updateFromPointer = (event) => {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    setFocus({
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    });
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerMove = (event) => {
    if (draggingRef.current) updateFromPointer(event);
  };

  const handlePointerUp = (event) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const focusStyle = getImageFocusStyle({ image_focus_x: focus.x, image_focus_y: focus.y });

  return (
    <Dialog open={open && Boolean(imageUrl)} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar enquadramento</DialogTitle>
          <DialogDescription>
            Clique ou arraste sobre a parte mais importante da foto (ex.: os rostos). As prévias mostram como ela vai aparecer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center rounded-xl bg-muted p-2">
          <div
            className="relative inline-block cursor-crosshair touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              draggable={false}
              className="block max-h-[40vh] w-auto max-w-full"
            />
            <span
              className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#E30613]/40 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
              style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {PREVIEWS.map((preview) => (
            <div key={preview.label} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{preview.label}</p>
              <div className={`${preview.aspect} w-full overflow-hidden rounded-lg border border-border bg-muted`}>
                <img src={imageUrl} alt="" className="h-full w-full object-cover" style={focusStyle} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setFocus({ x: 50, y: 50 })}>
            Centralizar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => onConfirm(focus)}>
              Confirmar enquadramento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
