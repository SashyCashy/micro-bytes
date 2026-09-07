import os

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from mealdb import search_meals, get_meal, extract_ingredients
from openfoodfacts import (
    search_products,
    get_product_details,
    get_search_nutriscore_grade,
)
from openfoodfacts.client import COUNTRIES, DEFAULT_COUNTRY, MAX_RESULTS, SORT_FIELDS

app = Flask(__name__)
CORS(app)
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


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5002)))