/** Shown when an upstream record has no image, or its image fails to load. */
export const PLACEHOLDER_IMAGE = '/images/placeholder-food.svg';
export type NutriScoreType = 'a' | 'b' | 'c' | 'd' | 'e';

export const NUTRI_SCORE_COLORS: Record<NutriScoreType, string> = {
  a: 'green',
  b: 'lime',
  c: 'yellow',
  d: 'orange',
  e: 'red',
};

export function isNutritionScore(
  value: string | undefined,
): value is NutriScoreType {
  return value !== undefined && value in NUTRI_SCORE_COLORS;
}
