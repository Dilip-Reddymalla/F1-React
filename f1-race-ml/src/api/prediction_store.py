"""MongoDB-backed store for completed race predictions.

Why this exists:
    The Monte Carlo engine is expensive (~10-30s first compute). Instead of
    letting the frontend wait every time, we persist the finished prediction
    per race + stage. The API then serves the stored record instantly and only
    recomputes when the record is missing or stale.

Design:
    - Key: (season, round, stage) where stage ∈ {pre-quali, post-quali, compare}
    - Each record stores `data_round` = the latest race round used when the
      prediction was computed. If the model has since seen a newer race, the
      record is stale and gets recomputed.
    - Mongo is optional: when MONGODB_URI is unset or the connection fails,
      the API falls back to computing on the fly (and in-memory cache).
"""
import os
import time
from datetime import datetime, timezone

try:
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
    PYMONGO_AVAILABLE = True
except Exception:  # pragma: no cover
    PYMONGO_AVAILABLE = False

COLLECTION = "prediction_records"


class PredictionStore:
    def __init__(self, uri=None):
        self._uri = uri or os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URI")
        self._client = None
        self._coll = None
        self._last_error = None
        self._connected_at = 0.0
        self._connect_ttl = 60.0  # retry reconnect at most once per minute
        if PYMONGO_AVAILABLE and self._uri:
            self._connect()

    def _connect(self):
        now = time.time()
        if self._client is not None and now - self._connected_at < self._connect_ttl:
            return
        try:
            self._client = MongoClient(self._uri, serverSelectionTimeoutMS=3000)
            db = self._client.get_default_database()
            self._coll = db[COLLECTION]
            # Drop any legacy unique index on the wrong field (key) — it made
            # the second insert fail with E11000 (all docs shared key: null).
            try:
                self._coll.drop_index("prediction_key_unique")
            except Exception:
                pass
            # Unique lookup key = (season, round, stage); _id remains the
            # composite string used for atomic upserts.
            self._coll.create_index(
                [("season", 1), ("round", 1), ("stage", 1)],
                unique=True,
                name="prediction_lookup_unique",
            )
            self._connected_at = now
            self._last_error = None
        except Exception as exc:  # noqa: BLE001
            self._last_error = str(exc)
            self._client = None
            self._coll = None

    @property
    def available(self):
        return self._coll is not None

    def _doc_id(self, season, round_, stage):
        return f"{season}:{round_}:{stage}"

    def get(self, season, round_, stage, data_round):
        """Return stored payload, or None if missing/stale/unavailable."""
        if not self.available:
            return None
        self._connect()
        if not self.available:
            return None
        try:
            doc = self._coll.find_one({"_id": self._doc_id(season, round_, stage)})
            if doc is None:
                return None
            # Stale if the model has moved past the round this was computed on.
            if doc.get("data_round") != int(data_round):
                return None
            return doc.get("payload")
        except Exception as exc:  # noqa: BLE001
            self._last_error = str(exc)
            return None

    def put(self, season, round_, stage, data_round, payload):
        """Upsert a completed prediction record."""
        if not self.available:
            return False
        self._connect()
        if not self.available:
            return False
        try:
            self._coll.replace_one(
                {"_id": self._doc_id(season, round_, stage)},
                {
                    "_id": self._doc_id(season, round_, stage),
                    "season": int(season),
                    "round": int(round_),
                    "stage": stage,
                    "data_round": int(data_round),
                    "payload": payload,
                    "created_at": datetime.now(timezone.utc),
                },
                upsert=True,
            )
            return True
        except Exception as exc:  # noqa: BLE001
            self._last_error = str(exc)
            return False

    def status(self):
        return {
            "available": self.available,
            "driver": "pymongo" if PYMONGO_AVAILABLE else None,
            "last_error": self._last_error,
        }


_store = PredictionStore()
