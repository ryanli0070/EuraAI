# EuraAI

A simple web app template with a **React** frontend and **FastAPI** backend, ready to scale with a database and OpenAI API integration.

## Structure

```
EuraAI/
├── frontend/          # React (Vite) app
│   ├── src/
│   │   ├── api/       # API client for backend
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── backend/           # FastAPI (Python) app
│   ├── main.py        # App entry, CORS, routers
│   ├── config.py      # Settings from env
│   ├── database.py    # SQLAlchemy async engine & sessions
│   ├── models/        # DB models
│   ├── routers/      # API routes (health, examples, openai)
│   ├── services/     # OpenAI and other external APIs
│   └── requirements.txt
└── README.md
```

## Quick start

### Backend

1. Create a virtual environment and install deps:

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # source .venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   ```

2. Copy env example and set your OpenAI key (optional for health/DB):

   ```bash
   copy .env.example .env   # Windows
   # cp .env.example .env   # macOS/Linux
   ```

   Edit `.env` and set `OPENAI_API_KEY` if you want to use the chat endpoint.

3. Run the API:

   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   API docs: http://localhost:8000/docs

### Frontend

1. Install and run:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. Open http://localhost:5173. The app talks to the backend via Vite’s proxy (`/api` → `http://localhost:8000`).

## Features

- **Database**: SQLAlchemy async with SQLite by default. Change `DATABASE_URL` in `.env` for PostgreSQL or others. Tables are created on startup.
- **OpenAI**: `POST /openai/chat` with `prompt` (and optional `system`, `model`). Use the `OpenAIService` in `backend/services/openai_service.py` for other models or endpoints.
- **Example CRUD**: `GET/POST /examples` and `GET /examples/{id}` show how to run database queries from routes.

## Scaling further

- Add new **models** in `backend/models/` and import in `models/__init__.py`.
- Add **routers** in `backend/routers/` and include them in `main.py`.
- Add **services** (e.g. more external APIs) in `backend/services/`.
- Extend the frontend **API client** in `frontend/src/api/client.js` and add UI in `App.jsx` or new components.
