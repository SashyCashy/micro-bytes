"""Natural-language search: the model reads the request, Python does the work.

The model is used for the one thing it is reliably good at — turning "low
sugar breakfast cereal" into keywords plus a numeric threshold — and for
nothing else. Filtering and ranking are ordinary Python, because asking the
model to also pick the results made the same question return two, three or
four products on consecutive runs.
"""

import json
import os

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Fields a filter may name, mapped onto the nutrition keys the API returns.
NUTRIENTS = ("calories", "protein", "fat", "carbs", "sugars", "salt")

COMPARISONS = {
    "lt": lambda value, limit: value < limit,
    "lte": lambda value, limit: value <= limit,
    "gt": lambda value, limit: value > limit,
    "gte": lambda value, limit: value >= limit,
}

SYSTEM_PROMPT = """You read a food search request and describe how to answer \
it. You do not choose the results — code does that from your description.

Return a plan through the `plan_search` tool. Every request gets exactly one \
plan.

Search terms: keywords only. "protein bar", never "high protein bar under 200 \
calories" — the upstream index matches keywords, so constraint words make it \
match nothing.

Filters: turn every nutritional constraint into a numeric threshold. All \
values are per 100g.

A number the user gives always wins, exactly as they said it. "less than 5g \
of salt" is salt lt 5, never a stricter figure you think is more sensible — \
the answer quotes their words back, so a different threshold makes it a lie.

Only when they give no number does vague wording become one:
  low sugar: sugars lt 5        high sugar: sugars gte 15
  low salt: salt lt 0.3         high salt: salt gte 1.5
  high protein: protein gte 15  low fat: fat lt 3
  low calorie: calories lt 150  high fibre is not available
A shopper saying "under 200 calories" is thinking of a serving, but the data \
is per 100g — pass their number through anyway and code will explain the \
basis.

Sort: leave at relevance unless the user explicitly wants the healthiest or \
worst options. Sorting by nutrition reorders every match in the database by \
grade, which drags in food that barely relates to the search.

Kind: "recipe" only when the user clearly wants something to cook. Recipes \
carry no nutrition data, so a request with any nutritional constraint is a \
product search.

Interpretation: one noun phrase naming what is being looked for, in the \
user's own terms — "breakfast cereals with under 5g of sugar". No greeting, \
no count, no promise about results; you cannot see them."""

PLAN_TOOL = [
    {
        "type": "function",
        "function": {
            "name": "plan_search",
            "description": "Describe how to answer the request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["product", "recipe"]},
                    "search_terms": {
                        "type": "string",
                        "description": "Keywords only, no constraints.",
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["relevance", "nutrition", "nutrition_desc"],
                    },
                    "country": {
                        "type": "string",
                        "description": (
                            "Open Food Facts country tag such as 'en:india', "
                            "or 'all' to search everywhere. Omit for the "
                            "default."
                        ),
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {
                                    "type": "string",
                                    "enum": list(NUTRIENTS),
                                },
                                "op": {
                                    "type": "string",
                                    "enum": list(COMPARISONS),
                                },
                                "value": {"type": "number"},
                            },
                            "required": ["field", "op", "value"],
                        },
                    },
                    "interpretation": {"type": "string"},
                },
                "required": ["kind", "search_terms", "interpretation"],
            },
        },
    }
]


class AssistantError(RuntimeError):
    """Raised when the assistant cannot produce a plan."""


def is_configured():
    """Whether an API key is present, so routes can 503 instead of raising."""
    return bool(os.getenv("OPENAI_API_KEY"))


def plan(query):
    """Ask the model how to answer `query`. One call, one tool, no loop."""
    from openai import OpenAI

    response = OpenAI().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        tools=PLAN_TOOL,
        # The plan is the only acceptable reply, and the same question must
        # always produce the same one.
        tool_choice={"type": "function", "function": {"name": "plan_search"}},
        temperature=0,
    )

    calls = response.choices[0].message.tool_calls

    if not calls:
        raise AssistantError("The assistant could not read that request.")

    try:
        raw = json.loads(calls[0].function.arguments or "{}")
    except json.JSONDecodeError as error:
        raise AssistantError("The assistant returned an unreadable plan.") from error

    return {
        "kind": "recipe" if raw.get("kind") == "recipe" else "product",
        "search_terms": (raw.get("search_terms") or query).strip(),
        "sort": raw.get("sort") if raw.get("sort") in ("nutrition", "nutrition_desc") else None,
        "country": raw.get("country"),
        "filters": _clean_filters(raw.get("filters")),
        "interpretation": (raw.get("interpretation") or query).strip(),
    }


def _clean_filters(filters):
    """Drop anything the model invented that we cannot evaluate."""
    if not isinstance(filters, list):
        return []

    cleaned = []

    for entry in filters:
        if not isinstance(entry, dict):
            continue

        field, op, value = entry.get("field"), entry.get("op"), entry.get("value")

        if field in NUTRIENTS and op in COMPARISONS and isinstance(value, (int, float)):
            cleaned.append({"field": field, "op": op, "value": float(value)})

    return cleaned


def _satisfies(item, spec):
    """Whether one item passes one filter. Missing data never passes."""
    value = (item.get("nutrition") or {}).get(spec["field"])

    if not isinstance(value, (int, float)):
        return None

    return COMPARISONS[spec["op"]](value, spec["value"])


def _distance(item, spec):
    """How far an item is from a threshold, for ordering the near misses."""
    value = (item.get("nutrition") or {}).get(spec["field"])

    if not isinstance(value, (int, float)):
        # Unknown values sort last: we cannot claim they are close.
        return float("inf")

    return abs(value - spec["value"])


def rank(items, filters, limit):
    """Matches first, then the nearest misses. Deterministic for a given input.

    Returning only exact matches is what made result counts jump around; a
    near miss shown as a near miss is more useful than an empty grid.
    """
    if not filters:
        return items[:limit], len(items[:limit])

    matched, missed, unknown = [], [], []

    for item in items:
        verdicts = [_satisfies(item, spec) for spec in filters]

        if any(verdict is None for verdict in verdicts):
            unknown.append(item)
        elif all(verdicts):
            matched.append(item)
        else:
            missed.append(item)

    primary = filters[0]
    matched.sort(key=lambda item: _distance(item, primary))
    missed.sort(key=lambda item: _distance(item, primary))

    return (matched + missed + unknown)[:limit], len(matched)


def describe(plan_, shown, fitting, sample_size):
    """The sentence above the results. Composed here so the counts are real."""
    subject = plan_["interpretation"]

    if not shown:
        return f"No matches for {subject} in the top {sample_size} results."

    if not plan_["filters"]:
        return f"Showing {shown} of the top {sample_size} matches for {subject}."

    basis = " Values are per 100g, not per serving."

    if fitting == 0:
        return (
            f"None of the top {sample_size} matches fit {subject}, so these are "
            f"the {shown} closest.{basis}"
        )

    if fitting < shown:
        return (
            f"{fitting} of these {shown} fit {subject}; the rest are the "
            f"closest misses.{basis}"
        )

    return f"All {shown} of these fit {subject}.{basis}"
