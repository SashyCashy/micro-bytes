import { Alert, Group, Select, SegmentedControl, Stack } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import SearchBar from '../components/Searchbar';
import Pagination from '../components/Pagination';
import SearchResults, { type SearchItem } from '../components/SearchResults';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { AssistResponse } from '../api/types';
import {
  assist,
  getCountries,
  searchProducts,
  searchRecipes,
} from '../api/recipes';

const PAGE_SIZE = 9;

// Mirrors the backend default, so the control shows what is actually applied
// before the user touches it.
const DEFAULT_COUNTRY = 'en:united-states';

// Mantine treats an empty string as "nothing selected", so the unfiltered
// choice needs its own sentinel; it maps to an empty `country` in the URL.
const ALL_COUNTRIES = 'all';

// Nutri-Score only exists on Open Food Facts products; TheMealDB carries no
// nutrition data, so recipes take the sort argument and ignore it.
const SORT_OPTIONS = [
  { label: 'Relevance', value: '' },
  { label: 'Best nutrition', value: 'nutrition' },
  { label: 'Worst nutrition', value: 'nutrition_desc' },
];

const SEARCH_TYPES = {
  recipe: {
    heading: 'Recipes',
    canSort: false,
    search: (
      query: string,
      page: number,
      _sort: string,
      _country: string,
      signal?: AbortSignal,
    ) => searchRecipes(query, page, signal),
    getItemUrl: (item: SearchItem) => `/recipes/${item.id}`,
  },
  product: {
    heading: 'Products',
    canSort: true,
    search: searchProducts,
    getItemUrl: (item: SearchItem) => `/products/${item.id}`,
  },
} as const;

type SearchType = keyof typeof SEARCH_TYPES;

function isSearchType(value: string | null): value is SearchType {
  return value !== null && value in SEARCH_TYPES;
}

export default function RecipeSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get('q') ?? '';
  const currentPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const typeParam = searchParams.get('type');
  const searchType: SearchType = isSearchType(typeParam) ? typeParam : 'recipe';
  const { heading, search, getItemUrl, canSort } = SEARCH_TYPES[searchType];
  // Sorting is meaningless for recipes, so it is dropped from the key and the
  // request rather than silently carried across a type switch.
  const sort = canSort ? (searchParams.get('sort') ?? '') : '';
  // Absent means the backend picks its default; an explicit empty value means
  // the user cleared the filter, so "all countries" survives a reload.
  const countryParam = searchParams.get('country');
  const country = canSort && countryParam !== null ? countryParam : undefined;

  // Local state keeps typing responsive; the URL is updated once debounced.
  const [query, setQuery] = useState(urlQuery);
  const [debouncedQuery] = useDebouncedValue(query, 400);

  const queryClient = useQueryClient();

  // Keyed by the query it answered and parked in the React Query cache, which
  // outlives this component — the page unmounts on the way to a details page,
  // so mutation state alone would lose the answer on every card click.
  const assistKey = ['assist', urlQuery];

  const { data: assistData } = useQuery<AssistResponse>({
    queryKey: assistKey,
    // Never fetched by this observer; it exists to read the cache and to hold
    // the entry alive while the search page is mounted.
    queryFn: () => Promise.reject(new Error('unreachable')),
    enabled: false,
    staleTime: Infinity,
    // Long enough to read a product and come back. Past this the answer is
    // gone and the keyword grid returns, which is the honest fallback.
    gcTime: 1000 * 60 * 30,
  });

  const assistant = useMutation({
    mutationFn: (q: string) => assist(q),
    onSuccess: (data, submitted) =>
      queryClient.setQueryData(['assist', submitted], data),
  });

  // The answer is stored under the query it answered, so the URL has to carry
  // that query before the request lands — otherwise the entry is written under
  // a key the page is not reading yet, and the result appears 400ms late when
  // the debounce catches up.
  const runAssist = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('q', value);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
    assistant.mutate(value);
  };

  // Keep the input in sync when the URL changes underneath us (back/forward,
  // or returning from a details page).
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  // An assistant answer describes the query that produced it, so it is dropped
  // the moment the query moves on — including via the clear button and the
  // header logo, which both empty the query. It deliberately lives outside the
  // URL: the answer is not reproducible from search params, so it does not
  // survive a reload, unlike keyword search.
  const assistReset = assistant.reset;

  useEffect(() => {
    assistReset();
  }, [query, assistReset]);

  useEffect(() => {
    if (debouncedQuery === urlQuery) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (debouncedQuery) {
          next.set('q', debouncedQuery);
        } else {
          next.delete('q');
        }
        // A new search starts over from the first page.
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedQuery, urlQuery, setSearchParams]);

  const setCurrentPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page > 1) {
      next.set('page', String(page));
    } else {
      next.delete('page');
    }
    setSearchParams(next);
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('sort', value);
    } else {
      next.delete('sort');
    }
    // Re-ordering changes which results land on which page.
    next.delete('page');
    setSearchParams(next);
  };

  const setCountry = (value: string) => {
    const next = new URLSearchParams(searchParams);
    // Always written, even empty, to distinguish "cleared" from "untouched".
    next.set('country', value);
    // A different country changes which results land on which page.
    next.delete('page');
    setSearchParams(next);
  };

  const setSearchType = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'recipe') {
      next.delete('type');
    } else {
      next.set('type', value);
    }
    // Result counts differ per type, so the current page may not exist.
    next.delete('page');
    setSearchParams(next);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['search', searchType, urlQuery, currentPage, sort, country],
    queryFn: ({ signal }) =>
      search(urlQuery, currentPage, sort, country as string, signal),
    enabled: urlQuery.trim().length >= 2,
  });

  // Static list, so it is fetched once and cached for the session.
  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: ({ signal }) => getCountries(signal),
    enabled: canSort,
    staleTime: Infinity,
  });

  const countryOptions = [
    { value: ALL_COUNTRIES, label: 'All countries' },
    ...(countries ?? []),
  ];
  const countryValue =
    country === undefined
      ? DEFAULT_COUNTRY
      : country === ''
        ? ALL_COUNTRIES
        : country;

  const assistResults = assistData?.results;
  const isAssisting = assistant.isPending;
  // The assistant answers across both types, so each result carries its own
  // route rather than taking the page's current search type.
  const getAssistItemUrl = (item: SearchItem) =>
    (item as { kind?: string }).kind === 'recipe'
      ? `/recipes/${item.id}`
      : `/products/${item.id}`;

  const totalResults = data?.total ?? 0;
  const totalPages = Math.ceil(totalResults / PAGE_SIZE);
  const isSearchActive = urlQuery.trim().length >= 2;
  const hasSearched = isSearchActive && data !== undefined;

  return (
    <Stack px={{ base: 'md', sm: 'xl' }}>
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        compact={isSearchActive}
        onAssist={runAssist}
        assistPending={isAssisting}
      />
      {isSearchActive && (
        <SegmentedControl
          value={searchType}
          onChange={setSearchType}
          data={[
            { label: 'Products', value: 'product' },
            { label: 'Recipes', value: 'recipe' },
          ]}
          w="fit-content"
          mx="auto"
          aria-label="Search type"
        />
      )}
      {isSearchActive && canSort && (
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Select
            value={countryValue}
            onChange={(value) =>
              setCountry(value === ALL_COUNTRIES ? '' : (value ?? ''))
            }
            data={countryOptions}
            searchable
            allowDeselect={false}
            w={220}
            aria-label="Country"
          />
          <Select
            value={sort}
            onChange={(value) => setSort(value ?? '')}
            data={SORT_OPTIONS}
            allowDeselect={false}
            w={200}
            aria-label="Sort by"
          />
        </Group>
      )}
      {(isAssisting || assistResults || assistant.isError) && (
        <Alert
          icon={<IconSparkles size={18} />}
          color="brand"
          variant="light"
          title={isAssisting ? 'Searching…' : 'AI search'}
        >
          {assistant.isError
            ? (assistant.error as Error).message
            : isAssisting
              ? 'Reading the results and picking the ones that fit.'
              : assistData?.answer}
        </Alert>
      )}
      {assistResults || isAssisting ? (
        <SearchResults
          items={assistResults ?? []}
          heading="AI results"
          getItemUrl={getAssistItemUrl}
          isLoading={isAssisting}
          hasSearched
          query={urlQuery}
          kind={searchType}
        />
      ) : (
        <SearchResults
          items={data?.products ?? []}
          heading={heading}
          getItemUrl={getItemUrl}
          isLoading={isLoading}
          isError={isError}
          error={error}
          hasSearched={hasSearched}
          query={urlQuery}
          kind={searchType}
        />
      )}
      {!assistResults && !isAssisting && <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />}
    </Stack>
  );
}
