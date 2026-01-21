"""
Main API entry point - backward compatibility wrapper.

The actual FastAPI application has been refactored into the api/ package.
This file maintains backward compatibility with the old structure.
"""
from dotenv import load_dotenv

load_dotenv()

from api.app import app

__all__ = ["app"]
