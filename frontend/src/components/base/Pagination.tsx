import React, { useEffect, useState } from "react";

export interface PaginationProps {
  page: number;          // 当前页
  pageSize: number;      // 每页条数
  total: number;         // 总条数
  disabled?: boolean;    // 禁用（加载中）
  onChange: (page: number) => void; // 页码变化回调
}

function Pagination({ page, pageSize, total, disabled, onChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil((total || 0) / (pageSize || 20)));
  const [pageInput, setPageInput] = useState<string>(String(page || 1));

  useEffect(() => {
    setPageInput(String(page));
  }, [page, pageCount]);

  const clamp = (n: number) => Math.min(Math.max(1, Math.floor(n)), pageCount);

  return (
    <div className="flex items-center justify-start gap-3">
      <button
        className="px-3 py-1 border rounded disabled:opacity-50"
        disabled={disabled || page <= 1}
        onClick={() => onChange(clamp(page - 1))}
      >
        上一页
      </button>

      <span className="text-sm text-gray-600">
        第 {page} / {pageCount} 页（共 {total} 条）
      </span>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">跳至</span>
        <input
          className="w-16 border rounded px-2 py-1 text-sm"
          inputMode="numeric"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = Number(pageInput);
              if (Number.isFinite(n) && n >= 1) onChange(clamp(n));
            }
          }}
          placeholder="页码"
          disabled={disabled}
        />
        <span className="text-sm text-gray-600">/ {pageCount}</span>
        <button
          className="px-3 py-1 border rounded disabled:opacity-50"
          disabled={disabled || !pageInput || !Number.isFinite(Number(pageInput)) || Number(pageInput) < 1}
          onClick={() => {
            const n = Number(pageInput);
            onChange(clamp(n));
          }}
        >
          跳转
        </button>
      </div>

      <button
        className="px-3 py-1 border rounded disabled:opacity-50"
        disabled={disabled || page >= pageCount}
        onClick={() => onChange(clamp(page + 1))}
      >
        下一页
      </button>
    </div>
  );
}

// ✅ 关键：导出默认组件
export default Pagination;
