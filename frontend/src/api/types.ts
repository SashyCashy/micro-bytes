export type SearchResponse<T> = {
  products: T[];
  total: number;
  totalIsExact?: boolean;
  page: number;
  offset: number;
};

export type ProductSummary = {
  id: string;
  title: string;
  image?: string;
  brand?: string;
  quantity?: string;
  nutriScore?: string;
};

export type Nutrition = Record<string, number | null | undefined>;

export type Product = ProductSummary & {
  ingredients?: string;
  categories?: string;
  allergens?: string[];
  nutrition?: Nutrition;
};

export type RecipeSummary = {
  id: string;
  title: string;
  image?: string;
};

export type Ingredient = { name: string; measure: string };

export type Recipe = RecipeSummary & {
  category?: string;
  area?: string;
  instructions?: string;
  sourceUrl?: string;
  youtubeUrl?: string;
  tags?: string[];
  ingredients?: Ingredient[];
};

/** One assistant result: the normal record plus which route it links to. */
export type AssistItem = ProductSummary & {
  kind: 'product' | 'recipe';
};

export type AssistResponse = {
  /** The assistant's own sentence about what it searched and found. */
  answer: string;
  results: AssistItem[];
};
