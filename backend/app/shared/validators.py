from datetime import datetime


def require_params(d: dict, keys: list):
    missing = [k for k in keys if not d.get(k)]
    return (len(missing) == 0, missing)


def parse_date_generic(s: str):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue
    try:
        # ISO 8601 flexible
        return datetime.fromisoformat(s).date()
    except Exception:
        return None
