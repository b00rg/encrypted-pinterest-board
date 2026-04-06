from flask import Blueprint

api = Blueprint("api", __name__, url_prefix="/api")

from . import auth, shelf, shelves, shelf_members, reviews, access_requests  # noqa: F401, E402
