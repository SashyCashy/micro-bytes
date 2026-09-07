# Architecture

## Shape

Two services, no database, no API keys.

```
Browser
  │
  ├─ /            ──▶ nginx (static React bundle)
  └─ /api/…       ──▶ nginx proxy ──▶ Flask ──┬──▶ TheMealDB
                                              ├──▶ Open Food Facts search index
                                              └──▶ Open Food Facts product API
```

The frontend never calls an upstream service directly. Everything goes through
Flask, which is what lets the app reshape two very different upstream payloads
into one response shape and keep the upstream quirks in one place.

## Why a backend at all

The frontend could call Open Food Facts from the browser. It does not, for three
reasons:

1. **The two upstreams disagree with each other.** Reconciling them (see
   [decisions.md](decisions.md)) needs a place to put the logic that is not the
   render path.
2. **Response shapes differ wildly.** TheMealDB returns ingredients as twenty
   flat `strIngredient1…20` / `strMeasure1…20` string pairs; Open Food Facts
   returns nested `nutriments` with per-100g float noise. Both are normalised
   server-side into `{ id, title, image, brand, quantity, nutriScore, nutrition }`,
   so the React components render one shape regardless of source.
3. **Failure translation.** Upstream errors become statuses the UI can act on,
   and the exception message is deliberately not logged — it embeds the full
   request URL.

## Request path, end to end

A product search from keystroke to render:

| Step | Where | What happens |
|---|---|---|
| 1 | `SearchBar` | Input updates local state, so typing stays responsive. |
| 2 | `RecipeSearchPage` | `useDebouncedValue` waits 400ms, then writes the term into the URL. |
| 3 | URL | `?q=…&type=product&country=…&sort=…&page=…` is the single source of truth. |
| 4 | React Query | The URL params form the query key, so back/forward and refresh hit cache. |
| 5 | `api/recipes.ts` | Builds the querystring; passes the `AbortSignal`. |
| 6 | Flask | Validates, pages, calls upstream, normalises the payload. |
| 7 | `SearchResults` | Renders cards, a skeleton, an error alert, or the empty state. |

## State model

There is no state library. State lives in exactly three places, by kind:

- **URL search params** — the search term, type, country, sort and page. Chosen
  so a search is linkable and survives refresh, and so the browser back button
  moves through searches rather than leaving the app.
- **React Query cache** — every server response, keyed by those same params.
  Retries are deliberately narrow: an `ApiError` means the request *landed* and
  the answer was a decision, so retrying only burns upstream quota. Only
  requests that never landed are retried.
- **Component state** — the in-flight input value, before debouncing.

## Frontend layout

```
src/
  api/          fetch layer: http.ts (ApiError), recipes.ts (endpoints), types.ts
  components/   presentational; AppShell/ holds Header and Body
  pages/        route-level containers, one per screen
  theme.ts      Mantine theme: the brand colour scale
  constants.ts  shared enums (Nutri-Score colours, placeholder image)
```

`ErrorBoundary` wraps the router, so a render-time crash shows a recoverable
fallback instead of a blank page.

## Backend layout

```
backend/
  app.py               routes, normalisation, error mapping
  mealdb/client.py     TheMealDB: search, lookup, ingredient flattening
  openfoodfacts/client.py  OFF: Lucene query building, search, product lookup
```

Clients know how to talk to an upstream and nothing about HTTP responses;
`app.py` owns the API contract. Only the fields actually rendered are requested
from upstream, which keeps responses small.

## Deployment

`docker compose up --build` runs both services. The frontend image is two-stage,
so Node and `node_modules` never reach the runtime image — nginx serves the built
assets and proxies `/api` to the backend. Because that proxy mirrors the Vite dev
proxy, the app calls the same origin in both environments and needs no
build-time API URL. Flask runs under gunicorn with threads, since every request
blocks on upstream network I/O.
