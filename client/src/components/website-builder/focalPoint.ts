export type FocalPoint = { x: number; y: number };

export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 50;
}

export function parseFocalPoint(position: string | null | undefined): FocalPoint {
  const match = position?.match(/^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/);
  return match ? { x: clampPercent(Number(match[1])), y: clampPercent(Number(match[2])) } : { x: 50, y: 50 };
}

export function formatFocalPoint(point: FocalPoint): string {
  return `${clampPercent(point.x)}% ${clampPercent(point.y)}%`;
}

export function pointFromPointer(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): FocalPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return {
    x: clampPercent((clientX - rect.left) / rect.width * 100),
    y: clampPercent((clientY - rect.top) / rect.height * 100),
  };
}
