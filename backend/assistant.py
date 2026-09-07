"""Natural-language search: the model drives the same upstream calls the API
already makes, then filters on fields the search index cannot express.

Open Food Facts' index is a Lucene keyword match, so a constraint like "under
200 calories" is unanswerable by search alone. Every product the API returns
already carries per-100g nutriments, so the model searches, reads the results,
and picks the ones that fit. It can only filter within what it fetched, which
is why the prompt insists the answer says so.
"""

import json
import os

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Each round is one model call. Enough for a search, an optional second search
# with different terms, and the answer; a runaway loop stops rather than
# billing indefinitely.
MAX_ROUNDS = 5

SYSTEM_PROMPT = """You are the search assistant for Micro Bytes, a food and \
recipe search app.

Turn the user's request into searches, then pick the results that genuinely \
fit. Work in this order:

1. Call search_products (packaged food, carries per-100g nutrition) or \
search_recipes (dish ideas, no nutrition data) with plain keywords. Strip \
constraints out of the search terms: search "protein bar", not "high protein \
bar under 200 calories" — the upstream index matches keywords only and \
constraint words make it match nothing.
   Leave sort at relevance unless the user is explicitly asking for the \
healthiest or worst options. Sorting by nutrition reorders every match in the \
database by grade, which pulls in food that barely relates to the search: a \
nutrition-sorted "breakfast cereal" search returns lentil pasta.
2. Read what comes back and apply the user's constraints yourself, against the \
nutrition values in the results.
3. Call present_results with the ids that fit, best first, and a one or two \
sentence answer.

Rules that matter:

- Every nutrition value is per 100g, never per serving. A shopper asking for "under 200 calories" is usually thinking of a serving, and almost no packaged snack is under 200 kcal per 100g. Apply the limit per 100g, and say which basis you used.
- Prefer showing something over showing nothing. If a numeric limit leaves nothing, present the closest few anyway and label them plainly as the nearest matches with their actual values — an empty grid tells the user nothing. Only return an empty list when the search itself found nothing relevant.
- Quote counts from the tool result, never from memory: sample_size is how many you saw, and the number of ids you pass is how many you are showing. Do not write a count you have not computed.
- Keep the answer internally consistent. If you say results fit, pass their ids; if none fit, say none fit and pass the nearest matches instead. Never both in one sentence.
- You only ever see a sample of the matches, not everything. Say so: "the top 24 matches" is honest, "everything that fits" is not.
- Never invent a product, an id, or a nutrition value. Only pass ids a search actually returned.
- A nutriScore of "unknown" or "not-applicable" means the grade is missing, not bad. Say the data is missing rather than treating it as a low grade.
"""

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": (
                "Search packaged food products. Results carry per-100g "
                "nutrition (calories, protein, fat, carbs, sugars, salt) and a "
                "Nutri-Score grade. Use plain keywords only."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Keywords only, no constraints.",
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["relevance", "nutrition", "nutrition_desc"],
                        "description": (
                            "'nutrition' ranks best Nutri-Score first, "
                            "'nutrition_desc' worst first."
                        ),
                    },
                    "country": {
                        "type": "string",
                        "description": (
                            "Open Food Facts country tag such as "
                            "'en:india'. Omit for the default, or pass 'all' "
                            "to search every country."
                        ),
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_recipes",
            "description": (
                "Search recipes by dish name. Recipes carry no nutrition data, "
                "so nutritional constraints cannot be applied to them."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Dish keywords."}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "present_results",
            "description": (
                "Show the chosen results to the user. Ends the turn — call it "
                "exactly once, including when nothing fits."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "answer": {
                        "type": "string",
                        "description": (
                            "One or two sentences: what was searched, how many "
                            "of the sample fit, and any caveat."
                        ),
                    },
                    "ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ids from search results, best first.",
                    },
                },
                "required": ["answer", "ids"],
            },
        },
    },
]


class AssistantError(RuntimeError):
    """Raised when the assistant cannot produce an answer."""


def is_configured():
    """Whether an API key is present, so routes can 503 instead of raising."""
    return bool(os.getenv("OPENAI_API_KEY"))


def _client():
    # Imported lazily so the rest of the API keeps working when the optional
    # dependency is absent or the key is unset.
    from openai import OpenAI

    return OpenAI()


def run(query, handlers):
    """Drive the tool loop until the model presents results.

    `handlers` maps a tool name to a callable taking the model's arguments and
    returning JSON-serialisable results.
    """
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]
    client = _client()

    for _ in range(MAX_ROUNDS):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOL_SCHEMAS, # type: ignore
        )
        message = response.choices[0].message
        messages.append(message.model_dump(exclude_none=True))

        if not message.tool_calls:
            # Answered without presenting anything — usually a clarifying
            # question. Pass the text through with no results.
            return {"answer": message.content or "", "ids": []}

        for call in message.tool_calls:
            name = call.function.name

            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

            if name == "present_results":
                return {
                    "answer": arguments.get("answer", ""),
                    "ids": [str(i) for i in arguments.get("ids", [])],
                }

            handler = handlers.get(name)
            result = (
                handler(**arguments)
                if handler
                else {"error": f"unknown tool: {name}"}
            )

            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result),
            })

    raise AssistantError("The assistant kept searching without answering.")
