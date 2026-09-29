const DEFAULT_FOCUS = 50;

function normalizeFocus(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_FOCUS;
  return Math.min(Math.max(number, 0), 100);
}

// Posiciona a imagem de destaque do aviso no ponto de foco salvo (0-100%),
// para que qualquer moldura com object-cover preserve a area importante da foto.
export function getImageFocusStyle(item) {
  const x = normalizeFocus(item?.image_focus_x ?? DEFAULT_FOCUS);
  const y = normalizeFocus(item?.image_focus_y ?? DEFAULT_FOCUS);
  return { objectPosition: `${x}% ${y}%` };
}
