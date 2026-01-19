"""Main FastAPI application with modularized routes."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.config import STATIC_DIR
from api.database import init_db
from api.routes import assets, attempts, auth, questions, statistics, tests, users
from api.services.cleanup_service import schedule_events_cleanup
from logging_setup import setup_console_logging

setup_console_logging()

app = FastAPI(title="Test Extractor API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Startup events
@app.on_event("startup")
def startup_events() -> None:
    """Initialize database and schedule cleanup tasks on startup."""
    init_db()
    schedule_events_cleanup()


# Root endpoint
@app.get("/")
def index() -> FileResponse:
    """Serve frontend index.html."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(index_path)


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tests.router)
app.include_router(assets.router)
app.include_router(questions.router)
app.include_router(attempts.router)
app.include_router(statistics.router)
