import requests

# The public test key. TheMealDB requires no signup for it.
BASE_URL = "https://www.themealdb.com/api/json/v1/1"

TIMEOUT = 10

# search.php has no paging and returns at most this many meals per query.
MAX_RESULTS = 25


def search_meals(query):
    """Return every meal matching a title search.

    TheMealDB has no pagination, so callers slice the list themselves. A query
    with no matches comes back as {"meals": null} rather than an empty list.
    """
    response = requests.get(
        f"{BASE_URL}/search.php",
        params={"s": query},
        timeout=TIMEOUT,
    )
    response.raise_for_status()

    return response.json().get("meals") or []


def get_meal(meal_id):
    response = requests.get(
        f"{BASE_URL}/lookup.php",
        params={"i": meal_id},
        timeout=TIMEOUT,
    )
    response.raise_for_status()

    meals = response.json().get("meals") or []

    return meals[0] if meals else None


def extract_ingredients(meal):
    """TheMealDB stores ingredients as 20 flat strIngredientN/strMeasureN pairs."""
    ingredients = []

    for index in range(1, 21):
        name = (meal.get(f"strIngredient{index}") or "").strip()
        measure = (meal.get(f"strMeasure{index}") or "").strip()

        if name:
            ingredients.append({"name": name, "measure": measure})

    return ingredients
