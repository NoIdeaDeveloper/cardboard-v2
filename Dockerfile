FROM python:3.12-slim

# Prevent Python from buffering stdout/stderr and writing .pyc files
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first (separate layer for better cache reuse)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy frontend assets
COPY frontend/ /app/frontend/

# Pre-create the data directory; the Docker volume will be mounted here at runtime
RUN mkdir -p /app/data

# Run as a non-root user for better security
RUN useradd --system --no-create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# access-log writes one line per request to stdout, captured by Docker's json-file driver
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--log-level", "info", \
     "--access-log"]
