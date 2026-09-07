import os

from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from mealdb import search_meals, get_meal, extract_ingredients
import assistant
from openfoodfacts import (
    search_products,
    get_product_details,
    get_search_nutriscore_grade,
)
from openfoodfacts.client import COUNTRIES, DEFAULT_COUNTRY, MAX_RESULTS, SORT_FIELDS

# Reads backend/.env for local runs; on a host the real environment wins,
# since load_dotenv does not overwrite variables that are already set.
load_dotenv()

app = Flask(__name__)

# Comma-separated origins, or "*" for any. Local runs and compose want any
# origin; a deployed API should name its own frontend, since without this the
# public API is callable from any page on the web.
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").strip()

if CORS_ORIGINS == "*":
    CORS(app)
else:
    # A host set by the platform arrives without a scheme, so add the one it
    # would be served over rather than silently failing to match.
    CORS(
        app,
        origins=[
            origin if "://" in origin else f"https://{origin}"
            for origin in (o.strip() for o in CORS_ORIGINS.split(",") if o.strip())
        ],
    )

app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True
RECIPE_PAGE_SIZE = 9
PRODUCT_PAGE_SIZE = 9


def upstream_error(name, error):
    """Map an upstream failure onto a status the frontend can act on."""
    status = getattr(error.response, "status_code", None)
    # Log the type only: the exception message embeds the URL, API key included.
    app.logger.warning("%s failed: %s (upstream %s)", name, type(error).__name__, status)

    if status == 402:
        return jsonify({
            "error": "The recipe API's daily limit has been reached. Try again tomorrow.",
            "reason": "quota_exceeded",
        }), 429

    return jsonify({"error": f"{name} is unavailable right now"}), 502


def json_response(payload, status=200):
    """Spoonacular-style pretty JSON, indented with 4 spaces."""
    return app.response_class(
        response=app.json.dumps(payload, indent=4) + "\n",
        status=status,
        mimetype="application/json",
    )


def round_nutrient(value):
    """Open Food Facts stores per-100g values with float noise."""
    if isinstance(value, (int, float)):
        return round(value, 1)

    return value


def format_brand(brands):
    if isinstance(brands, list):
        return ", ".join(brands)

    return brands


def format_meal_summary(meal):
    """TheMealDB fields mapped onto the shape the frontend expects."""
    return {
        "id": meal.get("idMeal"),
        "title": meal.get("strMeal"),
        "image": meal.get("strMealThumb"),
    }


def format_nutrition(nutriments):
    """Per-100g values, shared by the search and details routes."""
    return {
        "calories": round_nutrient(nutriments.get("energy-kcal_100g")),
        "protein": round_nutrient(nutriments.get("proteins_100g")),
        "fat": round_nutrient(nutriments.get("fat_100g")),
        "carbs": round_nutrient(nutriments.get("carbohydrates_100g")),
        "sugars": round_nutrient(nutriments.get("sugars_100g")),
        "salt": round_nutrient(nutriments.get("salt_100g")),
    }


def format_product(product):
    """Open Food Facts fields mapped onto the shape the frontend expects."""
    return {
        # Barcodes are strings and can exceed 32 bits, so keep them as strings.
        "id": product.get("code"),
        "title": product.get("product_name") or "Unnamed product",
        "image": product.get("image_front_url"),
        # The search API returns brands as a list, the product API as a string.
        "brand": format_brand(product.get("brands")),
        "quantity": product.get("quantity"),
        "nutriScore": product.get("nutriscore_grade"),
        "nutrition": format_nutrition(product.get("nutriments") or {}),
    }


@app.route("/api/search/recipe")
def search_recipe():
    query = request.args.get("query", "")
    page_number = max(request.args.get("page_number", 1, type=int), 1)
    offset = (page_number - 1) * RECIPE_PAGE_SIZE

    if not query:
        return jsonify({"products": [], "total": 0, "page": page_number, "offset": 0})

    try:
        meals = search_meals(query)
    except requests.RequestException as error:
        return upstream_error("Recipe search", error)

    # TheMealDB returns every match at once, so paginate here.
    page = meals[offset:offset + RECIPE_PAGE_SIZE]

    formatted_data = {
        "products": [format_meal_summary(meal) for meal in page],
        "total": len(meals),
        "page": page_number,
        "offset": offset,
    }

    return json_response(formatted_data)


@app.route("/api/recipes/<recipe_id>")
def fetch_recipe_details(recipe_id):
    try:
        meal = get_meal(recipe_id)
    except requests.RequestException as error:
        return upstream_error("Recipe lookup", error)

    if not meal:
        return jsonify({"error": "Recipe not found"}), 404

    formatted_data = {
        **format_meal_summary(meal),
        "category": meal.get("strCategory"),
        "area": meal.get("strArea"),
        "instructions": meal.get("strInstructions"),
        "sourceUrl": meal.get("strSource"),
        "youtubeUrl": meal.get("strYoutube"),
        "tags": [tag for tag in (meal.get("strTags") or "").split(",") if tag],
        "ingredients": extract_ingredients(meal),
    }

    return json_response(formatted_data)


@app.route("/api/search/products")
def search_product():
    query = request.args.get("query", "")
    page_number = max(request.args.get("page_number", 1, type=int), 1)
    # An unknown sort key is ignored rather than rejected, so a stale URL still
    # returns results instead of an error.
    sort = request.args.get("sort")
    sort = sort if sort in SORT_FIELDS else None
    # An absent `country` param keeps the default; an explicitly empty one means
    # the user cleared the filter and wants results from everywhere.
    country = request.args.get("country", DEFAULT_COUNTRY)

    if not query:
        return jsonify({"products": [], "total": 0, "page": page_number, "offset": 0})

    try:
        data = search_products(
            query=query,
            page=page_number,
            page_size=PRODUCT_PAGE_SIZE,
            country=country,
            sort=sort,
        )
    except requests.RequestException as error:
        return upstream_error("Product search", error)

    # The search service stops counting at MAX_RESULTS and flags the total as
    # inexact, so cap it rather than paginating past the end.
    total = min(data.get("count", 0), MAX_RESULTS)

    formatted_data = {
        "products": [format_product(product) for product in data.get("hits", [])],
        "total": total,
        "totalIsExact": data.get("is_count_exact", True),
        "page": page_number,
        "offset": (page_number - 1) * PRODUCT_PAGE_SIZE,
    }

    return json_response(formatted_data)


@app.route("/api/countries")
def list_countries():
    """The country filter's options, so the list lives in one place."""
    return json_response([
        {"value": tag, "label": label} for tag, label in COUNTRIES.items()
    ])


def search_nutriscore(product_code):
    """The index's grade for a barcode, or None if it cannot be reached."""
    try:
        return get_search_nutriscore_grade(product_code)
    except requests.RequestException:
        return None


@app.route("/api/products/<product_code>")
def fetch_product_details(product_code):
    try:
        data = get_product_details(product_code)
    except requests.RequestException as error:
        return upstream_error("Product lookup", error)

    product = data.get("product")

    if data.get("status") != 1 or not product:
        return jsonify({"error": "Product not found"}), 404

    formatted_data = {
        **format_product(product),
        # The list and this page must agree, and the search index is the chosen
        # source of truth for grades. Best effort: an index hiccup leaves the
        # product API's own grade in place rather than failing the page.
        "nutriScore": search_nutriscore(product_code)
        or product.get("nutriscore_grade"),
        "ingredients": product.get("ingredients_text"),
        "categories": product.get("categories"),
        "allergens": [
            tag.split(":", 1)[-1] for tag in product.get("allergens_tags", [])
        ],
    }

    return json_response(formatted_data)


# A wider sample than a UI page: the assistant filters on nutrition the search
# index cannot query, so it needs room to find matches within what it fetched.
ASSIST_SAMPLE_SIZE = 24

# Enough to fill the results grid without the model padding the list.
ASSIST_MAX_RESULTS = 9


def compact_for_model(item):
    """Only the fields the model reasons over.

    Images and URLs are dead weight in a prompt, and the full record would
    triple the token cost of every search round.
    """
    return {
        "id": item["id"],
        "title": item["title"],
        "brand": item.get("brand"),
        "quantity": item.get("quantity"),
        "nutriScore": item.get("nutriScore"),
        "nutrition": item.get("nutrition"),
    }


@app.route("/api/assist", methods=["POST"])
def assist():
    """Natural-language search: the model searches, then filters the results."""
    payload = request.get_json(silent=True) or {}
    query = (payload.get("query") or "").strip()

    if not query:
        return jsonify({"error": "Ask a question to search for."}), 400

    if not assistant.is_configured():
        return jsonify({
            "error": "AI search is not configured on this server.",
            "reason": "assistant_unconfigured",
        }), 503

    # Everything the model was shown, so ids it picks resolve back to the full
    # records the frontend renders. It never sees an id it was not given.
    seen = {}

    def search_products_tool(query, sort=None, country=None):
        country_tag = DEFAULT_COUNTRY if country is None else country
        # "all" is the model's way of clearing the filter; the client treats an
        # unknown tag as no filter, so an empty string is the right handoff.
        if country_tag == "all":
            country_tag = ""

        data = search_products(
            query=query,
            page=1,
            page_size=ASSIST_SAMPLE_SIZE,
            country=country_tag,
            sort=sort if sort in SORT_FIELDS else None,
        )
        items = [format_product(product) for product in data.get("hits", [])]

        for item in items:
            seen[item["id"]] = {"kind": "product", "item": item}

        return {
            "sample_size": len(items),
            "total_matches": min(data.get("count", 0), MAX_RESULTS),
            "results": [compact_for_model(item) for item in items],
        }

    def search_recipes_tool(query):
        meals = search_meals(query)[:ASSIST_SAMPLE_SIZE]
        items = [format_meal_summary(meal) for meal in meals]

        for item in items:
            seen[item["id"]] = {"kind": "recipe", "item": item}

        return {
            "sample_size": len(items),
            "total_matches": len(items),
            "results": [
                {"id": item["id"], "title": item["title"]} for item in items
            ],
        }

    try:
        result = assistant.run(
            query,
            {
                "search_products": search_products_tool,
                "search_recipes": search_recipes_tool,
            },
        )
    except requests.RequestException as error:
        return upstream_error("Search", error)
    except assistant.AssistantError as error:
        app.logger.warning("Assistant gave up: %s", error)
        return jsonify({"error": str(error)}), 502
    except Exception as error:
        # The provider SDK raises its own exception types; the message can
        # carry the request URL, so only the type is logged.
        app.logger.warning("Assistant failed: %s", type(error).__name__)
        return jsonify({"error": "AI search is unavailable right now"}), 502

    # Ids are filtered through `seen` rather than trusted: a hallucinated id
    # is dropped instead of 404ing the frontend.
    chosen = [seen[item_id] for item_id in result["ids"] if item_id in seen]

    return json_response({
        "answer": result["answer"],
        "results": [
            {**entry["item"], "kind": entry["kind"]}
            for entry in chosen[:ASSIST_MAX_RESULTS]
        ],
    })


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5002)))