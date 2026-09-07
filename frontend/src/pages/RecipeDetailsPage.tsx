import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Image,
  List,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getRecipeDetails } from '../api/recipes';
import { PLACEHOLDER_IMAGE } from '../constants';
import RecipeDetailsSkeleton from './RecipeDetailsSkeleton';
type Ingredient = { name: string; measure: string };

export default function RecipeDetailsPage() {
  // TheMealDB ids are numeric strings, so they are not parsed as numbers.
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by the results list so we return to the same search and page.
  const backTo = (
    location.state as { backTo?: { pathname: string; search: string } } | null
  )?.backTo ?? { pathname: '/', search: '' };

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: ({ signal }) => getRecipeDetails(recipeId!, signal),
    enabled: Boolean(recipeId),
  });

  if (recipeQuery.isLoading) {
    return <RecipeDetailsSkeleton />;
  }

  if (recipeQuery.isError || !recipeQuery.data) {
    return (
      <Alert color="red" title="Recipe unavailable">
        {recipeQuery.error?.message ?? 'We could not load this recipe.'}
      </Alert>
    );
  }

  const recipe = recipeQuery.data;

  return (
    <Stack component="article" gap="lg">
      <Button
        leftSection={<IconArrowLeft size={18} />}
        variant="subtle"
        onClick={() => navigate(backTo)}
        aria-label="Back to recipe list"
        w="fit-content"
      >
        Back to recipes
      </Button>
      <Title order={1}>{recipe.title}</Title>
      <Group gap="xs">
        {recipe.category && <Badge variant="light">{recipe.category}</Badge>}
        {recipe.area && <Badge variant="light">{recipe.area}</Badge>}
        {recipe.tags?.map((tag: string) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </Group>
      <Image
        src={recipe.image}
        fallbackSrc={PLACEHOLDER_IMAGE}
        alt=""
        maw={640}
        radius="md"
      />
      {(recipe.ingredients?.length ?? 0) > 0 && (
        <Stack gap="xs">
          <Title order={2}>Ingredients</Title>
          <List>
            {recipe.ingredients!.map((ingredient: Ingredient) => (
              <List.Item key={ingredient.name}>
                {ingredient.measure
                  ? `${ingredient.measure} ${ingredient.name}`
                  : ingredient.name}
              </List.Item>
            ))}
          </List>
        </Stack>
      )}
      {recipe.instructions && (
        <Stack gap="xs">
          <Title order={2}>Instructions</Title>
          {/* TheMealDB returns plain text with newlines, not HTML. */}
          <Text style={{ whiteSpace: 'pre-line' }}>{recipe.instructions}</Text>
        </Stack>
      )}
      <Group gap="md">
        {recipe.youtubeUrl && (
          <Anchor href={recipe.youtubeUrl} target="_blank" rel="noreferrer">
            Watch on YouTube
          </Anchor>
        )}
        {recipe.sourceUrl && (
          <Anchor href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            Original recipe
          </Anchor>
        )}
      </Group>
    </Stack>
  );
}
