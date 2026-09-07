# Design decisions

Decisions where the reasoning is not visible in the code, and what each one
costs.

## The search index is the source of truth for Nutri-Score

**Problem.** Open Food Facts serves two versions of the Nutri-Score algorithm
under the same field name. The search index (`search.openfoodfacts.org`) returns
2021 grades; the product API (`world.openfoodfacts.org/api/v2`) returns 2023. The
same barcode therefore came back a grade apart depending on which service
answered, and the result list and the details page disagreed for every product:

| Barcode | Product | Search list | Details page |
|---|---|---|---|
| 8901595863051 | Pasta Masala | c | e |
| 8901058003079 | Pazzta Cheesy Tomato | d | e |
| 8901058890020 | Pazzta Masala Penne | c | d |

**Decision.** The index wins. `/api/products/<code>` looks the barcode up in the
search index and overwrites the grade before responding.

**Rejected alternative.** Correcting the *search results* against the product API
instead, which would have matched openfoodfacts.org. It was implemented and
worked, but was reversed in favour of the index: it added an upstream request to
every search page, and the sort order (below) would still have come from the
index, leaving grades and ranking on different algorithms.

**Rejected alternative.** Passing the grade from the list into the details page
via router state. Cheapest option, but a direct URL, a refresh or a shared link
carries no state, so the mismatch returns in exactly the case it was first
reported in.

**Costs, accepted knowingly.**
- Both surfaces now disagree with openfoodfacts.org, which shows the 2023 grade.
- One extra upstream request per details page view.
- Products absent from the index keep the product API's 2023 grade. There is
  nothing to reconcile against, and dropping the badge would be worse.
- The lookup is best-effort: if the index is unreachable the product API's own
  grade stands, because a stale badge beats a failed page.

## "Best nutrition" sorting stays upstream

Sorting is done by the search index via `sort_by`, not in Flask. Ordering only
the current page locally would produce a list sorted *within* each page and wrong
*across* pages.

The consequence is unresolved: ranking uses 2021 `nutriscore_score`. Grades are
now internally consistent with it, but neither matches openfoodfacts.org. Sorting
correctly by 2023 is not possible through this API — only the index can order all
matches, and it only knows the old scores.

## Nine results per page

Nine, not ten, so the `{ base: 1, sm: 2, md: 3 }` grid fills evenly as 3×3
instead of leaving a stray card on the last row.

The page size is defined in **two** places that must agree: `RECIPE_PAGE_SIZE` /
`PRODUCT_PAGE_SIZE` in `app.py` decide what is fetched, and `PAGE_SIZE` in
`RecipeSearchPage.tsx` computes the pager. Changing only the backend silently
hides the tail of the results.

## User input is stripped of Lucene operators, not quoted

The index parses `q` as Lucene, so a stray `+`, `-` or `:` from a user makes the
whole query fail. Quoting the term instead would turn it into a phrase match
against the default field, which matches nothing. So operator characters are
replaced with spaces and bare `AND`/`OR`/`NOT` keywords dropped.

## Theme follows the system, with an override

`MantineProvider` uses `defaultColorScheme="auto"`; the header toggle overrides
it and Mantine persists the choice. `ColorSchemeScript` applies the stored scheme
before first paint, so a light-mode viewer never sees a dark flash.

Anything that switches on theme must read the *computed* scheme, not
`prefers-color-scheme` — a CSS media query only knows the OS setting and would
ignore the toggle. The wordmark in `Header.tsx` had this bug and now derives its
source from `useComputedColorScheme`.

The exception is the favicon and `theme-color` in `index.html`. They live in
browser chrome outside the React tree, so a media query is the only handle
available; they follow the OS even when the app is toggled against it.

## Empty states are inline SVG

`EmptyResults` draws its illustrations inline rather than loading them from
`public/images`, so strokes can use `currentColor` and accents a theme variable.
One drawing then adapts to both schemes; a flat `.svg` file would need a
dark/light pair like the other brand assets.

Recipes get an empty plate, products an empty shelf, both under the same
magnifier so they read as one family. Copy is per-kind: the product hint mentions
widening the country filter, a real cause of zero results on Open Food Facts.

## Barcodes are strings

Open Food Facts codes exceed 32 bits and carry meaningful leading zeros
(`00016124`). They are never parsed as numbers, anywhere.
