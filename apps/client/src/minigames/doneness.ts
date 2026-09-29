/** Points for how cooked something is: 3 perfect, 2 fine, 1 raw or burnt. */
export function doneness(d: number): { points: number; label: string } {
  if (d < 0.65) return { points: 1, label: 'Rå!' };
  if (d < 0.85) return { points: 2, label: 'Lidt blød' };
  if (d <= 1.25) return { points: 3, label: 'Perfekt!' };
  if (d <= 1.5) return { points: 2, label: 'Sprød' };
  return { points: 1, label: 'Brændt!' };
}
