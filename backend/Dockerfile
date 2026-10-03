FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.28 /uv /usr/local/bin/uv
WORKDIR /backend
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN uv sync --frozen --extra ai --no-dev
RUN useradd --create-home api && chown -R api:api /backend
USER api
ENV PATH="/backend/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
