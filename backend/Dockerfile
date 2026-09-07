FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Requirements are copied on their own so the dependency layer is only rebuilt
# when they actually change, not on every source edit.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

# Runs as a non-root user; the image needs no write access to its own files.
RUN useradd --create-home appuser
USER appuser

EXPOSE 5002

# Flask's dev server is single-threaded and warns against production use; the
# upstream calls block on network I/O, so threads matter more than processes.
#
# Shell form so $PORT is expanded at runtime: hosts like Render assign a port
# and expect the process to bind it, and a hardcoded port fails their health
# check. Falls back to 5002, which is what compose and local runs use.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5002} --workers 2 --threads 4 --timeout 60 app:app"]
