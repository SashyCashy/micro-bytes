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

## Notes

Open Food Facts serves two versions of the Nutri-Score algorithm: the search
index returns 2021 grades and the product API returns 2023, so the same barcode
differs by a grade between the two. The search index is treated as the source of
truth, and the product details route reconciles against it, so a product shows
the same grade in the result list and on its own page.
