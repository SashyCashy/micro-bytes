import { useRef } from 'react';
import {
  ActionIcon,
  Center,
  CloseButton,
  Group,
  Image,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';

type SearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  compact?: boolean;
  /** Runs the natural-language search. Explicit by design: it costs a request
   *  per call, so it never rides the debounce that keyword search uses. */
  onAssist?: (query: string) => void;
  assistPending?: boolean;
  /** Whether an assistant answer is currently on screen. */
  assistActive?: boolean;
};

// Height of the bar alone, used as the collapsed target for the shell. It has
// to be a real number rather than `undefined`, or there is nothing for the
// min-height transition to interpolate towards and the bar snaps to the top.
const COMPACT_HEIGHT = 96;

export default function SearchBar({
  query,
  onQueryChange,
  compact = false,
  onAssist,
  assistPending = false,
  assistActive = false,
}: SearchBarProps) {
  // Everything below stays mounted across the compact toggle: React keeps the
  // same DOM nodes, so the CSS transitions actually have a previous value to
  // animate from (and the input keeps focus and caret position).

  // The button lives inside the input, so clicking it moves focus out of the
  // field. Handing focus back keeps the next keystroke going where the user
  // expects — they cleared the box to type something else.
  const inputRef = useRef<HTMLInputElement>(null);

  const clearQuery = () => {
    onQueryChange('');
    inputRef.current?.focus();
  };

  const canAssist = Boolean(onAssist) && query.trim().length >= 2;

  // Always actionable rather than disabled when empty: a dead button teaches
  // nothing, so it puts the cursor where the question goes instead.
  const runAssist = () => {
    if (canAssist) {
      onAssist!(query.trim());
    } else {
      inputRef.current?.focus();
    }
  };

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
          ref={inputRef}
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
          // Escape is the keyboard equivalent, and is what people reach for
          // before they look for a button.
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              clearQuery();
            }
            // Enter asks the assistant. Keyword search needs no submit — it
            // already runs off the debounce as you type.
            if (event.key === 'Enter') {
              event.preventDefault();
              runAssist();
            }
          }}
          // Mantine sets pointer-events: none on section wrappers so they do
          // not block clicks into the field; without this the button renders
          // but cannot be clicked.
          rightSectionPointerEvents="all"
          // Held constant so the field does not resize as the clear button
          // comes and goes.
          rightSectionWidth={88}
          rightSection={
            <Group gap={2} wrap="nowrap" pr={4} justify="flex-end" w="100%">
              <Tooltip
                label={
                  assistActive
                    ? 'Turn off AI search'
                    : canAssist
                      ? 'Ask AI about this (Enter)'
                      : 'Type a question, then ask AI'
                }
                openDelay={300}
              >
                <ActionIcon
                  // The twinkle is an invitation, so it stops once the offer
                  // has been taken up.
                  className={
                    assistPending || assistActive ? undefined : 'assist-star'
                  }
                  variant={assistActive ? 'light' : 'subtle'}
                  // Brand orange marks AI as on; otherwise it sits in the
                  // field at text weight, like the clear button beside it.
                  color={assistActive ? 'brand' : 'gray'}
                  size="lg"
                  aria-label={
                    assistActive ? 'Turn off AI search' : 'Search with AI'
                  }
                  aria-pressed={assistActive}
                  loading={assistPending}
                  onClick={runAssist}
                >
                  <IconSparkles size={20} />
                </ActionIcon>
              </Tooltip>
              {query ? (
                <CloseButton
                  size="lg"
                  aria-label="Clear search"
                  onClick={clearQuery}
                />
              ) : null}
            </Group>
          }
          value={query}
          onChange={(e) => onQueryChange(e.currentTarget.value)}
          w={{ base: '100%', sm: compact ? 760 : 1000 }}
        />
      </div>
    </Center>
  );
}
