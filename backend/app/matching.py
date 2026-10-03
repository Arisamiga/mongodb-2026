"""Similarity helpers for matching lost and found items."""

from __future__ import annotations

import math
import threading
from typing import Any


class SentenceEncoder:
    """Lazily load a CPU sentence-transformer and encode normalized vectors."""

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model: Any | None = None
        self._lock = threading.Lock()

    def encode(self, text: str) -> list[float]:
        with self._lock:
            if self._model is None:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name, device="cpu")
            vector = self._model.encode(text, normalize_embeddings=True)
            return [float(value) for value in vector]


def text_for_item(item: dict) -> str:
    """Build stable descriptive text from an item's searchable fields."""
    parts: list[str] = []
    for field in ("title", "description", "category"):
        value = item.get(field)
        if value is not None and str(value).strip():
            parts.append(f"{field}: {str(value).strip()}")

    attributes = item.get("attributes")
    if isinstance(attributes, dict):
        for key, value in sorted(attributes.items(), key=lambda pair: str(pair[0])):
            if value is not None and str(value).strip():
                parts.append(f"{key}: {str(value).strip()}")
    return ". ".join(parts)


def _semantic_similarity(first: Any, second: Any) -> float:
    if len(first) != len(second):
        raise ValueError("Embedding vectors must have the same dimensions")
    if not first:
        return 0.0

    dot = sum(float(a) * float(b) for a, b in zip(first, second))
    first_norm = math.sqrt(sum(float(value) ** 2 for value in first))
    second_norm = math.sqrt(sum(float(value) ** 2 for value in second))
    if first_norm == 0.0 or second_norm == 0.0:
        return 0.0
    return min(1.0, max(0.0, dot / (first_norm * second_norm)))


def _attributes_similarity(first: Any, second: Any) -> float | None:
    if not isinstance(first, dict) or not isinstance(second, dict):
        return None
    shared = first.keys() & second.keys()
    if not shared:
        return None
    matches = sum(
        str(first[key]).strip().casefold() == str(second[key]).strip().casefold() for key in shared
    )
    return matches / len(shared)


def _location_similarity(first: Any, second: Any, distance_scale_km: float) -> float:
    if distance_scale_km <= 0:
        raise ValueError("distance_scale_km must be greater than zero")
    try:
        lon1, lat1 = first["coordinates"]
        lon2, lat2 = second["coordinates"]
        lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    except (KeyError, TypeError, ValueError):
        return 0.0

    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    distance_km = 6371.0088 * 2 * math.asin(math.sqrt(min(1.0, haversine)))
    return math.exp(-distance_km / distance_scale_km)


def score_items(lost: dict, found: dict, distance_scale_km: float = 5.0) -> dict:
    """Return heuristic component similarities and their weighted score.

    The score is a similarity heuristic, not a calibrated match probability.
    """
    components = {
        "semantic": _semantic_similarity(lost.get("embedding", []), found.get("embedding", [])),
        "location": _location_similarity(
            lost.get("location"), found.get("location"), distance_scale_km
        ),
        "category": float(
            bool(lost.get("category"))
            and bool(found.get("category"))
            and str(lost["category"]).strip().casefold()
            == str(found["category"]).strip().casefold()
        ),
    }
    attributes = _attributes_similarity(lost.get("attributes"), found.get("attributes"))
    if attributes is not None:
        components["attributes"] = attributes

    weights = {
        "semantic": 0.65,
        "attributes": 0.15,
        "location": 0.15,
        "category": 0.05,
    }
    total_weight = sum(weights[name] for name in components)
    score = sum(weights[name] * value for name, value in components.items()) / total_weight
    return {"score": min(1.0, max(0.0, score)), "components": components}
