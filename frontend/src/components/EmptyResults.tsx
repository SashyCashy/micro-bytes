import { Stack, Text, Title } from '@mantine/core';

/** Which illustration and copy the empty state shows. */
export type EmptyResultsKind = 'recipe' | 'product';

const SVG_SIZE = 220;

/** Shared magnifier, so both illustrations read as "we looked, and found nothing". */
function Magnifier({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const offset = r * 0.75;
  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--mantine-color-brand-6)"
        opacity="0.07"
      />
      <g
        stroke="var(--mantine-color-brand-6)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      >
        <circle cx={cx} cy={cy} r={r} />
        <path d={`M${cx + offset} ${cy + offset}l16 16`} />
      </g>
    </>
  );
}

/**
 * Drawn inline rather than loaded from `public/images` so the strokes can take
 * `currentColor` and the accents a theme variable — flat .svg files would need
 * a light and a dark copy of each.
 */
function EmptyPlate() {
  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox="0 0 160 160"
      fill="none"
      role="img"
      aria-label="An empty plate"
      style={{ color: 'var(--mantine-color-dimmed)' }}
    >
      {/* Outer rim plus inner well, so it reads as a plate rather than a pair
          of concentric circles. */}
      <ellipse
        cx="80"
        cy="92"
        rx="52"
        ry="34"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.55"
      />
      <ellipse
        cx="80"
        cy="92"
        rx="34"
        ry="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 6"
        opacity="0.4"
      />

      {/* Cutlery, angled outwards so the plate keeps the centre. */}
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
      >
        <path d="M24 72v44" />
        <path d="M18 72v14a6 6 0 0 0 12 0V72" />
        <path d="M136 72c6 6 6 18 0 22v22" />
      </g>

      <Magnifier cx={86} cy={60} r={24} />
    </svg>
  );
}

function EmptyShelf() {
  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox="0 0 160 160"
      fill="none"
      role="img"
      aria-label="An empty shelf"
      style={{ color: 'var(--mantine-color-dimmed)' }}
    >
      {/* Two bare shelves: the packaged-goods counterpart to the empty plate. */}
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      >
        <path d="M22 96h116" />
        <path d="M22 128h116" />
        <path d="M32 96v32" />
        <path d="M128 96v32" />
      </g>

      {/* A single tipped-over jar left on the lower shelf — the shelf is empty,
          but not sterile. */}
      <g
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.45"
        fill="none"
      >
        <rect x="46" y="108" width="30" height="18" rx="4" />
        <path d="M76 113h8v8h-8" />
      </g>

      {/* Price-tag outline, empty where a product would be. */}
      <g
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.35"
        fill="none"
      >
        <path d="M96 108h26v18H96z" />
        <path d="M102 117h14" />
      </g>

      <Magnifier cx={80} cy={56} r={26} />
    </svg>
  );
}

const COPY: Record<EmptyResultsKind, { title: string; hint: string }> = {
  recipe: {
    title: 'Nothing on the plate',
    hint: 'Try a different spelling, or a broader term like “chicken”.',
  },
  product: {
    title: 'The shelf is empty',
    hint: 'Try a different spelling, a broader term, or widen the country filter.',
  },
};

type EmptyResultsProps = {
  /** The term that was searched, echoed back in the message. */
  query?: string;
  kind?: EmptyResultsKind;
};

export default function EmptyResults({
  query,
  kind = 'recipe',
}: EmptyResultsProps) {
  const { title, hint } = COPY[kind];

  return (
    <Stack align="center" gap="xs" py="xl">
      {kind === 'product' ? <EmptyShelf /> : <EmptyPlate />}
      <Title order={3} fw={600}>
        {title}
      </Title>
      <Text c="dimmed" ta="center" maw={420}>
        {query ? `We could not find anything for “${query}”. ${hint}` : hint}
      </Text>
    </Stack>
  );
}
