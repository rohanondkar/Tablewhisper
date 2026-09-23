export const CREATURE_SIZES = [
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
] as const;

export type CreatureSize = (typeof CREATURE_SIZES)[number];

export const SIZE_TO_SQUARES: Record<string, number> = {
  Tiny: 0.5,
  Small: 1,
  Medium: 1,
  Large: 2,
  Huge: 3,
  Gargantuan: 4,
};

export function sizeToSquares(size: string | undefined | null): number {
  if (!size) return 1;
  return SIZE_TO_SQUARES[size] ?? 1;
}
