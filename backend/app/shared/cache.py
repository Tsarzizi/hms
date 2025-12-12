# 线程安全的内存缓存
import threading
import time
from typing import Any, Optional, Dict, Tuple


class ThreadSafeCache:
    def __init__(self, max_size: int = 1000):
        self._cache: Dict[str, Tuple[Optional[float], Any]] = {}
        self._lock = threading.RLock()  # 可重入锁，支持嵌套
        self._max_size = max_size
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        """获取缓存值，线程安全"""
        with self._lock:
            now = time.time()
            item = self._cache.get(key)

            if item is None:
                self._misses += 1
                return None

            expires, value = item
            if expires is not None and now >= expires:
                del self._cache[key]
                self._misses += 1
                return None

            self._hits += 1
            return value

    def set(self, key: str, value: Any, ttl_seconds: int = 0) -> None:
        """设置缓存值，线程安全"""
        with self._lock:
            # 如果超过最大大小，移除最旧的一个项目
            if len(self._cache) >= self._max_size and key not in self._cache:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]

            expires = (time.time() + ttl_seconds) if ttl_seconds and ttl_seconds > 0 else None
            self._cache[key] = (expires, value)

    def delete(self, key: str) -> bool:
        """删除缓存值，线程安全"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """清空所有缓存，线程安全"""
        with self._lock:
            self._cache.clear()

    def stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            return {
                'size': len(self._cache),
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': f"{hit_rate:.1f}%",
                'max_size': self._max_size
            }

    def cleanup_expired(self) -> int:
        """清理过期缓存，返回清理的数量"""
        with self._lock:
            now = time.time()
            expired_keys = [
                key for key, (expires, _) in self._cache.items()
                if expires is not None and now >= expires
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)


# 创建全局缓存实例
_cache = ThreadSafeCache(max_size=2000)


# 兼容原有接口的函数
def cache_get(key: str) -> Optional[Any]:
    return _cache.get(key)


def cache_set(key: str, value: Any, ttl_seconds: int = 0) -> None:
    _cache.set(key, value, ttl_seconds)


def cache_clear(key: str) -> None:
    _cache.delete(key)


def cache_stats() -> Dict[str, Any]:
    return _cache.stats()


def cache_cleanup() -> int:
    return _cache.cleanup_expired()