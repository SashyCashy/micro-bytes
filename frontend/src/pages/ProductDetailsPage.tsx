import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Group,
  Image,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import RecipeDetailsSkeleton from './RecipeDetailsSkeleton';
import { getProductDetails } from '../api/recipes';
import {
  isNutritionScore,
  NUTRI_SCORE_COLORS,
  PLACEHOLDER_IMAGE,
} from '../constants';

const NUTRIENT_LABELS: Record<string, string> = {
  calories: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbs',
  sugars: 'Sugars',
  salt: 'Salt',
};

export default function ProductDetailsPage() {
  // Product ids are barcodes, so they stay strings rather than numbers.
  const { productCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (
    location.state as { backTo?: { pathname: string; search: string } } | null
  )?.backTo ?? { pathname: '/', search: '?type=product' };

  const productQuery = useQuery({
    queryKey: ['product', productCode],
    queryFn: ({ signal }) => getProductDetails(productCode!, signal),
    enabled: Boolean(productCode),
  });

  if (productQuery.isLoading) {
    return <RecipeDetailsSkeleton />;
  }

  if (productQuery.isError || !productQuery.data) {
    return <Alert color="red">We could not load this product.</Alert>;
  }

  const product = productQuery.data;
  const nutrition = product.nutrition ?? {};
  const nutrients = Object.entries(NUTRIENT_LABELS).filter(
    ([key]) => nutrition[key] !== null && nutrition[key] !== undefined,
  );

  return (
    <Stack component="article" gap="lg">
      <Button
        leftSection={<IconArrowLeft size={18} />}
        variant="subtle"
        onClick={() => navigate(backTo)}
        aria-label="Back to product list"
        w="fit-content"
      >
        Back to products
      </Button>
      <Title order={1}>{product.title}</Title>
      <Group gap="xs">
        {product.brand && <Text c="dimmed">{product.brand}</Text>}
        {product.quantity && <Badge variant="light">{product.quantity}</Badge>}
        {isNutritionScore(product?.nutriScore) && (
          <Badge color={NUTRI_SCORE_COLORS[product.nutriScore]}>
            Nutri Score {product.nutriScore.toUpperCase()}
          </Badge>
        )}
      </Group>
      <Image
        src={product.image}
        fallbackSrc={PLACEHOLDER_IMAGE}
        alt=""
        maw={420}
        h={280}
        fit="contain"
        radius="md"
      />
      {nutrients.length > 0 && (
        <Stack gap="xs">
          <Title order={2}>Nutrition (per 100g)</Title>
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
            {nutrients.map(([key, label]) => (
              <Stack key={key} gap={0}>
                <Text size="sm" c="dimmed">
                  {label}
                </Text>
                <Text fw={600}>{nutrition[key]}</Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Stack>
      )}
      {product.ingredients && (
        <Stack gap="xs">
          <Title order={2}>Ingredients</Title>
          <Text>{product.ingredients}</Text>
        </Stack>
      )}
      {(product.allergens?.length ?? 0) > 0 && (
        <Stack gap="xs">
          <Title order={2}>Allergens</Title>
          <Group gap="xs">
            {product.allergens!.map((allergen: string) => (
              <Badge key={allergen} color="orange" variant="light">
                {allergen}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
