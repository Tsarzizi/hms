def safe_pct_change(curr, prev):
    if prev is None or prev == 0 or curr is None:
        return None
    try:
        return (curr - prev) / prev
    except Exception:
        return None