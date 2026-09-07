import { Stack, Skeleton, Group } from '@mantine/core';

/** Mirrors the loaded layout below, so nothing shifts when the data lands. */
export default function RecipeDetailsSkeleton() {
  return (
    <Stack gap="lg" aria-busy="true" aria-label="Loading recipe details">
      <Skeleton height={36} width={150} radius="sm" />
      <Skeleton height={38} width="60%" radius="sm" />
      <Group gap="xs">
        <Skeleton height={22} width={80} radius="xl" />
        <Skeleton height={22} width={64} radius="xl" />
      </Group>
      <Skeleton height={360} maw={640} radius="md" />
      <Stack gap="xs">
        <Skeleton height={28} width={140} radius="sm" />
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            height={14}
            width={`${70 - index * 6}%`}
            radius="sm"
          />
        ))}
      </Stack>
      <Stack gap="xs">
        <Skeleton height={28} width={160} radius="sm" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton
            key={index}
            height={12}
            width={index === 4 ? '45%' : '100%'}
            radius="sm"
          />
        ))}
      </Stack>
    </Stack>
  );
}
