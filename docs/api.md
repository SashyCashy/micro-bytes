# API reference

All responses are JSON, pretty-printed with 4-space indent. No authentication.

## `GET /api/search/recipe`

| Param | Default | Notes |
|---|---|---|
| `query` | — | Empty query returns an empty result set, not an error. |
| `page_number` | `1` | Clamped to a minimum of 1. |

TheMealDB has no pagination and returns at most 25 meals, so the backend slices
the list itself. `total` is therefore exact.

## `GET /api/search/products`

| Param | Default | Notes |
|---|---|---|
| `query` | — | Lucene operators are stripped before use. |
| `page_number` | `1` | Clamped to a minimum of 1. |
| `sort` | relevance | `nutrition` or `nutrition_desc`; unknown values are ignored rather than rejected, so a stale URL still returns results. |
| `country` | `en:united-states` | An **absent** param means the default; an **empty** one means search everywhere. The two are deliberately different. |

The index stops counting at 10,000 hits, so `total` is capped and
`totalIsExact` reports whether it can be trusted.

### Response shape

```jsonc
{
  "products": [
    {
      "id": "8901058003079",      // barcode, always a string
      "title": "Maggi cheesy Tomato",
      "image": "https://…",
      "brand": "Maggi",
      "quantity": "68.5",
      "nutriScore": "d",          // may be "unknown" or "not-applicable"
      "nutrition": { "calories": 339, "protein": 10.3, /* … per 100g */ }
    }
  ],
  "total": 167,
  "totalIsExact": true,
  "page": 2,
  "offset": 9
}
```

`nutriScore` is not always a grade. `unknown` and `not-applicable` are valid
values that the frontend filters out via `isNutritionScore()` rather than
rendering as a badge.

## `GET /api/recipes/<recipe_id>`

Adds `category`, `area`, `instructions`, `sourceUrl`, `youtubeUrl`, `tags` and a
flattened `ingredients` array of `{ name, measure }`.

## `GET /api/products/<product_code>`

Adds `ingredients`, `categories` and `allergens`. The `nutriScore` is reconciled
against the search index — see [decisions.md](decisions.md).

Returns `404` with `{"error": "Product not found"}` for an unknown barcode.

## `GET /api/countries`

The country filter's options as `{ value, label }`, so the list lives in one
place rather than being duplicated in the frontend.

## Errors

| Status | When |
|---|---|
| `404` | Unknown recipe or barcode. |
| `429` | Upstream quota exhausted; body carries `reason: "quota_exceeded"`. |
| `502` | Upstream unreachable or erroring. |

Bodies carry a human-readable `error` string, which `fetchJson` surfaces to the
UI in place of a generic message.
