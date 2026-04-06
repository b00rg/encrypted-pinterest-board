import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

API_BASE = "https://openlibrary.org"
TIMEOUT = 5  # seconds per request
CACHE_TTL = 3600  # 1 hour

_book_cache: dict[str, tuple[dict | None, float]] = {}


def search_books(query: str, limit: int = 10) -> list[dict]:
    try:
        resp = requests.get(
            f"{API_BASE}/search.json",
            params={"q": query, "limit": limit, "fields": "key,title,author_name,first_publish_year,cover_i"},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            return [
                {
                    "work_id": doc["key"].replace("/works/", ""),
                    "title": doc.get("title", "Unknown"),
                    "author": ", ".join(doc.get("author_name", [])) or "Unknown",
                    "year": doc.get("first_publish_year"),
                    "cover_id": doc.get("cover_i"),
                }
                for doc in resp.json().get("docs", [])
                if "key" in doc
            ]
    except requests.RequestException:
        pass
    return []


def _fetch_book(work_id: str) -> dict | None:
    """Fetch book details from OpenLibrary. Tries search API first (gives author+year),
    falls back to works API."""
    # Try search API — returns author_name and first_publish_year
    try:
        resp = requests.get(
            f"{API_BASE}/search.json",
            params={
                "q": f"key:/works/{work_id}",
                "fields": "key,title,author_name,first_publish_year,cover_i",
                "limit": 1,
            },
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            docs = resp.json().get("docs", [])
            if docs:
                doc = docs[0]
                return {
                    "work_id": work_id,
                    "title": doc.get("title", "Unknown"),
                    "author": ", ".join(doc.get("author_name", [])) or None,
                    "year": doc.get("first_publish_year"),
                    "cover_id": doc.get("cover_i"),
                    "description": "",
                }
    except requests.RequestException:
        pass

    # Fallback: works API (no author/year)
    try:
        resp = requests.get(f"{API_BASE}/works/{work_id}.json", timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            desc = data.get("description", "")
            if isinstance(desc, dict):
                desc = desc.get("value", "")
            covers = data.get("covers", [])
            cover_id = covers[0] if covers else None
            return {
                "work_id": work_id,
                "title": data.get("title", "Unknown"),
                "description": desc,
                "cover_id": cover_id,
                "author": None,
                "year": None,
            }
    except requests.RequestException:
        pass

    return None


def get_book(work_id: str) -> dict | None:
    """Get a single book's details, using cache."""
    now = time.time()
    if work_id in _book_cache:
        result, ts = _book_cache[work_id]
        if now - ts < CACHE_TTL:
            return result
    result = _fetch_book(work_id)
    _book_cache[work_id] = (result, now)
    return result


def get_books_batch(work_ids: list[str]) -> dict[str, dict]:
    """Fetch multiple books in parallel, returning a dict of work_id → metadata.
    Uses the in-memory cache to avoid redundant network calls."""
    result: dict[str, dict] = {}
    to_fetch: list[str] = []
    now = time.time()

    for wid in work_ids:
        if wid in _book_cache:
            cached, ts = _book_cache[wid]
            if now - ts < CACHE_TTL:
                if cached:
                    result[wid] = cached
                continue
        to_fetch.append(wid)

    if to_fetch:
        with ThreadPoolExecutor(max_workers=min(10, len(to_fetch))) as executor:
            futures = {executor.submit(_fetch_book, wid): wid for wid in to_fetch}
            for future in as_completed(futures):
                wid = futures[future]
                try:
                    book = future.result()
                except Exception:
                    book = None
                _book_cache[wid] = (book, now)
                if book:
                    result[wid] = book

    return result
