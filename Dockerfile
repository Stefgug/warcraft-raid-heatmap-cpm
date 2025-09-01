FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

# Default PORT for Hugging Face Spaces is 7860; allow override
ENV PORT=7860
EXPOSE 7860

# Use shell form so ${PORT} expands; fallback to 7860
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}"'
