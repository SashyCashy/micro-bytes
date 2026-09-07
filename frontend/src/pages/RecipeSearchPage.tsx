import { Group, Select, SegmentedControl, Stack } from '@mantine/core';
import SearchBar from '../components/Searchbar';
import Pagination from '../components/Pagination';
import SearchResults, { type SearchItem } from '../components/SearchResults';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { getCountries, searchProducts, searchRecipes } from '../api/recipes';

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

  // Keep the input in sync when the URL changes underneath us (back/forward,
  // or returning from a details page).
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

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
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </Stack>
  );
}
