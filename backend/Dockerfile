FROM python:3.11-slim

# System libs needed by pix2text's image stack (opencv, libgomp for torch).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Pix2Text caches model weights here. Mount /data as a persistent volume in
# prod so weights aren't re-downloaded on every deploy.
ENV P2T_MODEL_DIR=/data/pix2text
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
