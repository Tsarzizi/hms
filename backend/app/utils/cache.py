# 简单内存缓存：key -> (expires_ts, value)
import time
from typing import Any, Optional

_cache = {}


def cache_get(key: str) -> Optional[Any]:
    now = time.time()
    item = _cache.get(key)
    if not item:
        return None
    expires, value = item
    if expires is not None and now >= expires:
        _cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: int = 0) -> None:
    expires = (time.time() + ttl_seconds) if ttl_seconds and ttl_seconds > 0 else None
    _cache[key] = (expires, value)


def cache_clear(key: str) -> None:
    _cache.pop(key, None)
