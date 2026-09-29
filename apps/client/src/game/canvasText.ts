/**
 * Draws centred text that always keeps a margin: the font shrinks until the text
 * fits in `maxWidth` (so long names never run to the edge of a sign).
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  family = 'Rye, serif',
) {
  let px = size;
  ctx.font = `${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 12) {
    px -= 2;
    ctx.font = `${px}px ${family}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
