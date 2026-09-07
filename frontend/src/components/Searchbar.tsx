import { Center, Image, Text, TextInput } from '@mantine/core';

type SearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  compact?: boolean;
};

// Height of the bar alone, used as the collapsed target for the shell. It has
// to be a real number rather than `undefined`, or there is nothing for the
// min-height transition to interpolate towards and the bar snaps to the top.
const COMPACT_HEIGHT = 96;

export default function SearchBar({
  query,
  onQueryChange,
  compact = false,
}: SearchBarProps) {
  // Everything below stays mounted across the compact toggle: React keeps the
  // same DOM nodes, so the CSS transitions actually have a previous value to
  // animate from (and the input keeps focus and caret position).
  return (
    <Center className="searchbar-shell" mih={compact ? COMPACT_HEIGHT : '75vh'}>
      <div className="searchbar-row">
        <div className={`searchbar-logo${compact ? ' is-compact' : ''}`}>
          <Image
            className="searchbar-mark"
            src="/images/microbytes-mark-transparent.svg"
            alt="Micro Bytes"
            w={compact ? 56 : 200}
            h={compact ? 56 : 200}
            fit="contain"
          />
          <div className="searchbar-brand">
            <Text size="xl" className="brand-name" aria-label="MicroBytes">
              <span className="brand-name-micro">Micro</span>
              <span className="brand-name-bytes">Bytes</span>
            </Text>
            <Text className="brand-tagline">Find food. Get answers.</Text>
          </div>
        </div>
        <TextInput
          className="search-input"
          size="xl"
          placeholder="Search recipes or products..."
          leftSection={
            <Image
              src="/images/microbytes-search-icon-dark.svg"
              alt=""
              w={24}
              h={24}
              fit="contain"
            />
          }
          value={query}
          onChange={(e) => onQueryChange(e.currentTarget.value)}
          w={{ base: '100%', sm: compact ? 760 : 1000 }}
        />
      </div>
    </Center>
  );
}
