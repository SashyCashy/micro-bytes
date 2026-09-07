# Micro Bytes

Food and recipe search over [TheMealDB](https://www.themealdb.com/) and
[Open Food Facts](https://world.openfoodfacts.org/). React + Mantine frontend,
Flask backend, no API keys required.

## Run with Docker

```bash
docker compose up --build
```

- App: http://localhost:8080
- API: http://localhost:5002

nginx serves the built frontend and proxies `/api` to the backend, so the app
calls the same origin in Docker and in development.

## Run locally

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py            # http://localhost:5002

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:5173, proxies /api to :5002
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the pieces fit and why there is a backend
- [docs/decisions.md](docs/decisions.md) — design decisions and what each one costs
- [docs/api.md](docs/api.md) — endpoint reference

## Deploy to Render

`render.yaml` provisions both services: Dashboard → New → Blueprint → pick this
repo. It creates a Docker web service for the API and a static site for the
frontend, with rewrites standing in for the nginx `/api` proxy and `try_files`,
and locks the API's CORS to the static site's origin.

If the API service is named anything other than `micro-bytes-api`, update the
rewrite destination in `render.yaml` to match its URL.

On the free plan services spin down after 15 minutes idle, so the first request
after a pause takes around a minute.

## Notes

Open Food Facts serves two versions of the Nutri-Score algorithm: the search
index returns 2021 grades and the product API returns 2023, so the same barcode
differs by a grade between the two. The search index is treated as the source of
truth, and the product details route reconciles against it, so a product shows
the same grade in the result list and on its own page.
