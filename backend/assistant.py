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

# Kept in step with DIET_LABELS in the Open Food Facts client.
DIETS = ("vegetarian", "vegan", "gluten-free", "organic", "palm-oil-free")

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

Diet: set it when the user names one, including in passing ("I'm vegan"). It \
filters on the label the producer declared, so never put words like vegan or \
gluten-free in the search terms — those only match product names.

Kind: "recipe" only when the user clearly wants something to cook. Recipes \
carry no nutrition data, so a request with any nutritional constraint is a \
product search.

Clarification: when the message names no food to search for, set \
`clarification` to one short question asking what they are looking for, and \
leave everything else out. "I am vegetarian" states a preference but no \
subject — ask what they want to eat rather than inventing one.

What you must never do:

- Never invent a food. Every word in search_terms has to come from the user's \
message or be an obvious synonym of it. "I am vegetarian" does not imply \
protein bars, snacks, or anything else.
- Never invent a threshold. A filter exists only if the user asked for one, \
either with a number or with wording like "low sugar". No constraint in the \
message means no filters at all.
- Never guess at what they probably meant when the message is too thin to act \
on. Asking costs one sentence; guessing wrong wastes the whole answer.

But a food category is a subject, not a thin message. If the message contains \
any food word at all — "cereal", "snacks", "chicken", "pasta" — search for it. \
Breadth is not a reason to ask: "cereal" means search cereal, not ask which \
kind. Ask only when there is no food word anywhere in the message.
- Never describe results. You cannot see any. The interpretation names what is \
being looked for and stops there — no counts, no claims about what was found, \
no recommendations.

search_terms is required for every request that is not a clarification. Do \
not leave it out because the phrasing was conversational — "can you list \
chicken recipes" is a search for "chicken".

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
                    "diet": {"type": "string", "enum": list(DIETS)},
                    "interpretation": {"type": "string"},
                    "clarification": {
                        "type": "string",
                        "description": (
                            "Set instead of a search when the message names "
                            "no food to look for."
                        ),
                    },
                },
                "required": [],
            },
        },
    }
]


# Words that carry no search subject on their own. Anything left after these
# are removed is a food word as far as we are concerned.
FILLER_WORDS = frozenset("""
a an the and or of for with without some any my me i im id is are am be
hi hello hey please thanks thank you show find get give looking look want
need search suggest recommend something anything eat eating food foods
buy what which where how can could would should do does tell list give
recipe recipes dish dishes meal meals idea ideas option options
kind kinds type types sort variety best top good great nice
today tonight tomorrow now please me us
""".split()) | set(DIETS) | {"gluten", "free"}


# Phrases that name a diet, longest first so "gluten free" is matched before
# "free". Detected here rather than left to the model: it drops the diet field
# whenever the prompt is reordered, and a missed diet silently returns food the
# user cannot eat.
DIET_PHRASES = (
    ("palm oil free", "palm-oil-free"),
    ("no palm oil", "palm-oil-free"),
    ("gluten free", "gluten-free"),
    ("gluten-free", "gluten-free"),
    ("glutenfree", "gluten-free"),
    ("vegetarian", "vegetarian"),
    ("veggie", "vegetarian"),
    ("vegan", "vegan"),
    ("organic", "organic"),
)


def detect_diet(text):
    """The diet named in `text`, and `text` with that phrase removed.

    The phrase has to come out of the search terms: the index matches it
    against product names, so "vegan snacks" finds snacks with "vegan" in the
    title rather than snacks labelled vegan.
    """
    lowered = f" {text.lower()} "
    found = None

    for phrase, diet in DIET_PHRASES:
        if f" {phrase} " in lowered:
            found = found or diet
            lowered = lowered.replace(f" {phrase} ", " ")

    return found, " ".join(lowered.split())


def _subject_words(query):
    """The query's food words, if any — filler and diet names removed."""
    cleaned = "".join(
        character if character.isalnum() or character.isspace() else " "
        for character in query.lower()
    )

    return [word for word in cleaned.split() if word not in FILLER_WORDS]


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
        tools=PLAN_TOOL, # type: ignore
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

    clarification = (raw.get("clarification") or "").strip()

    search_terms = (raw.get("search_terms") or "").strip()

    # The model sets `diet` only when the prompt happens to be worded the way
    # it likes, so the query is checked directly and the model's answer is
    # only a fallback.
    detected_diet, without_diet = detect_diet(search_terms)
    query_diet, _ = detect_diet(query)

    if detected_diet:
        search_terms = without_diet

    # The model is unreliable about when to ask: it will answer "vegan snacks"
    # one call and ask which kind the next. So the decision is made here — if
    # the message contains a food word, that word is the search, and any
    # clarification the model wanted to ask is dropped.
    subject = _subject_words(query)

    if not search_terms and subject:
        search_terms = " ".join(subject)

    # Asking is a last resort, never an alternative to answering: the model
    # routinely returns a usable plan *and* a follow-up question, and showing
    # results beats asking which kind of cereal they meant.
    if search_terms:
        clarification = ""

    # Nothing to search for and nothing to go on: asking beats inventing.
    if not search_terms and not clarification:
        clarification = "What food are you looking for?"

    return {
        "clarification": clarification,
        "diet": detected_diet
        or query_diet
        or (raw.get("diet") if raw.get("diet") in DIETS else None),
        "kind": "recipe" if raw.get("kind") == "recipe" else "product",
        "search_terms": search_terms,
        "sort": raw.get("sort") if raw.get("sort") in ("nutrition", "nutrition_desc") else None,
        "country": raw.get("country"),
        "filters": _clean_filters(raw.get("filters")),
        # Falls back to the search terms rather than the raw message: echoing
        # "I am vegetarian, show me protein bars" back as the subject of a
        # sentence reads as a parroted prompt, not an interpretation.
        "interpretation": (raw.get("interpretation") or search_terms or query).strip(),
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

    # The interpretation usually says it already; repeating it reads as noise.
    if plan_["diet"] and plan_["diet"] not in subject.lower():
        subject = f"{subject} labelled {plan_['diet']}"

    if not shown:
        # Distinguishes "the search found nothing" from "nothing in the sample
        # fit", which are different problems for the user.
        return f"No matches for {subject}."

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
