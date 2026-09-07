import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  Image,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link, useLocation } from 'react-router';
import EmptyResults, { type EmptyResultsKind } from './EmptyResults';
import { PLACEHOLDER_IMAGE } from '../constants';
import { NUTRI_SCORE_COLORS, isNutritionScore } from '../constants';

export type SearchItem = {
  id: number | string;
  title: string;
  image?: string;
  brand?: string;
  quantity?: string;
  nutriScore?: string;
  nutrition?: { calories?: number | null; protein?: number | null /* … */ };
};

type SearchResultsProps = {
  items?: SearchItem[];
  error?: Error | null;
  heading: string;
  getItemUrl: (item: SearchItem) => string;
  isLoading?: boolean;
  isError?: boolean;
  hasSearched?: boolean;
  /** The term that was searched, echoed back by the empty state. */
  query?: string;
  /** Picks which empty-state illustration and copy to show. */
  kind?: EmptyResultsKind;
};

export default function SearchResults({
  items = [],
  error,
  heading,
  getItemUrl,
  isLoading = false,
  isError = false,
  hasSearched = false,
  query,
  kind,
}: SearchResultsProps) {
  const location = useLocation();
  // Preserve the active search so the details page can link back to it.
  const backTo = { pathname: '/', search: location.search };

  if (!hasSearched && !isLoading && !isError) {
    return null;
  }

  if (isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} withBorder padding="md">
            <Skeleton height={180} mb="md" />
            <Skeleton height={20} width="75%" />
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  if (isError) {
    return (
      <Alert color="red" role="alert" title="Search unavailable">
        {error?.message ?? "We couldn't load the results. Please try again."}
      </Alert>
    );
  }

  if (items.length === 0) {
    return <EmptyResults query={query} kind={kind} />;
  }

  return (
    <Stack gap="md" component="section" aria-label={`${heading} results`}>
      <Title order={2}>{heading}</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {items.map((item) => (
          <Card
            key={item.id}
            withBorder
            padding="md"
            shadow="sm"
            radius="md"
            h="100%"
          >
            <Anchor
              component={Link}
              to={getItemUrl(item)}
              state={{ backTo }}
              tabIndex={-1}
              aria-hidden
            >
              <Card.Section>
                <Image
                  src={item.image}
                  fallbackSrc={PLACEHOLDER_IMAGE}
                  alt=""
                  height={180}
                  fit="contain"
                />
              </Card.Section>
            </Anchor>
            <Anchor
              component={Link}
              to={getItemUrl(item)}
              state={{ backTo }}
              c="inherit"
              underline="never"
            >
              {/* Always reserve two lines so a short title does not shift
                  the badge row up relative to neighbouring cards. */}
              <Text fw={600} mt="md" lineClamp={2} lh={1.4} mih="2.8em">
                {item.title}
              </Text>
            </Anchor>
            {(item.brand ||
              item.quantity ||
              isNutritionScore(item.nutriScore)) && (
              <Group gap="xs" mt="xs" wrap="nowrap">
                {item.brand && (
                  <Text size="sm" truncate style={{ minWidth: 0 }}>
                    {item.brand}
                  </Text>
                )}
                {item.quantity && (
                  <Badge variant="light" size="sm" style={{ flexShrink: 0 }}>
                    {item.quantity}
                  </Badge>
                )}
                {item.nutrition?.calories != null && (
                  <Badge
                    // Shade 1 of the brand scale; `autoContrast` flips the label
                    // to dark text, which a pale fill needs in both schemes.
                    color="brand.2"
                    variant="filled"
                    autoContrast
                    size="sm"
                    style={{ flexShrink: 0 }}
                  >
                    {item.nutrition.calories} kcal
                  </Badge>
                )}
                {isNutritionScore(item.nutriScore) && (
                  <Badge
                    color={NUTRI_SCORE_COLORS[item.nutriScore]}
                    size="sm"
                    style={{ flexShrink: 0, marginLeft: 'auto' }}
                  >
                    {item.nutriScore.toUpperCase()}
                  </Badge>
                )}
              </Group>
            )}
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
