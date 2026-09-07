import re

import requests

BASE_URL = "https://world.openfoodfacts.org"
# The legacy /cgi/search.pl endpoint is heavily rate limited; this is the
# supported search service and returns hits/count instead of products.
SEARCH_URL = "https://search.openfoodfacts.org"

# Open Food Facts asks every client to identify itself in the User-Agent so they
# can contact operators about misbehaving traffic. There is no API key.
HEADERS = {
    "User-Agent": "micro-bytes/1.0 (https://github.com/SashyCashy/micro-bytes)"
}

TIMEOUT = 10

# Open Food Facts is EU-heavy, so results are filtered to one country by
# default. Override with the `country` argument (an OFF country tag).
DEFAULT_COUNTRY = "en:united-states"

# The country tag is interpolated straight into the Lucene query, so it is
# matched against this allowlist rather than escaped. Labels are the frontend's.
COUNTRIES = {
    "en:united-states": "United States",
    "en:united-kingdom": "United Kingdom",
    "en:canada": "Canada",
    "en:australia": "Australia",
    "en:france": "France",
    "en:germany": "Germany",
    "en:spain": "Spain",
    "en:italy": "Italy",
    "en:belgium": "Belgium",
    "en:netherlands": "Netherlands",
    "en:switzerland": "Switzerland",
    "en:india": "India",
    "en:japan": "Japan",
    "en:mexico": "Mexico",
    "en:brazil": "Brazil",
}

# The search service caps how many hits it will report.
MAX_RESULTS = 10000

# Sort keys the frontend may ask for, mapped onto the upstream sort_by field.
# nutriscore_score runs low-to-good, so ascending puts grade A first.
SORT_FIELDS = {
    "nutrition": "nutriscore_score",
    "nutrition_desc": "-nutriscore_score",
}

# Only ask for the fields we actually render, which keeps responses small.
SEARCH_FIELDS = ",".join([
    "code",
    "product_name",
    "brands",
    "image_front_url",
    "nutriscore_grade",
    "quantity",
    "nutriments",
])

PRODUCT_FIELDS = ",".join([
    "code",
    "product_name",
    "brands",
    "image_front_url",
    "nutriscore_grade",
    "quantity",
    "ingredients_text",
    "allergens_tags",
    "categories",
    "nutriments",
])


# Lucene treats these as operators, and a stray one makes the whole query fail.
UNSAFE_QUERY_CHARS = re.compile(r'[+\-!(){}\[\]^"~*?:\\/]|&&|\|\|')

LUCENE_KEYWORDS = {"AND", "OR", "NOT"}


def build_query(query, country=DEFAULT_COUNTRY):
    """Free text plus an optional country filter clause.

    User input is stripped of Lucene operators rather than quoted, because a
    quoted term is treated as a phrase against the default field and matches
    nothing. An unknown country tag is dropped rather than filtered on.
    """
    cleaned = UNSAFE_QUERY_CHARS.sub(" ", query)
    terms = [
        word for word in cleaned.split() if word.upper() not in LUCENE_KEYWORDS
    ]
    parts = [" ".join(terms)] if terms else []

    if country in COUNTRIES:
        parts.append(f'countries_tags:"{country}"')

    return " ".join(parts)


def search_products(query, page=1, page_size=10, country=DEFAULT_COUNTRY, sort=None):
    """`sort` is a key of SORT_FIELDS; anything else falls back to relevance."""
    params = {
        "q": build_query(query, country),
        "page": page,
        "page_size": page_size,
        "fields": SEARCH_FIELDS,
    }

    # Sorting has to happen upstream: ordering just the current page here would
    # produce a list that is sorted within a page but wrong across pages.
    sort_by = SORT_FIELDS.get(sort)
    if sort_by:
        params["sort_by"] = sort_by

    response = requests.get(
        f"{SEARCH_URL}/search",
        params=params,
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    response.raise_for_status()

    return response.json()


def get_search_nutriscore_grade(product_code):
    """The search index's Nutri-Score grade for one barcode, or None.

    The index and the product API serve different versions of the Nutri-Score
    algorithm (2021 and 2023) under the same field name, so the same barcode
    comes back a grade apart depending on which answered. The index is the
    chosen source of truth, so the details route reconciles against it.
    """
    response = requests.get(
        f"{SEARCH_URL}/search",
        params={
            "q": f"code:{product_code}",
            "page_size": 1,
            "fields": "code,nutriscore_grade",
        },
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    response.raise_for_status()

    hits = response.json().get("hits", [])

    return hits[0].get("nutriscore_grade") if hits else None


def get_product_details(product_code):
    response = requests.get(
        f"{BASE_URL}/api/v2/product/{product_code}.json",
        params={"fields": PRODUCT_FIELDS},
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    response.raise_for_status()

    return response.json()
