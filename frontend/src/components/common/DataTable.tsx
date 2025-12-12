// src/components/common/DataTable.tsx
import React from "react";

export interface Column<T> {
  /** 列唯一 key */
  key: string;
  /** 表头显示文字 */
  title: React.ReactNode;
  /** 单元格渲染函数，不传则显示 row[key] */
  render?: (row: T, index: number) => React.ReactNode;
  /** 单元格额外 className，可选 */
  className?: string;
  /** 表头额外 className，可选 */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  /** 数据源 */
  data: T[];
  /** 列配置 */
  columns: Column<T>[];
  /** 表格标题（可选） */
  title?: React.ReactNode;
  /** 没有数据时的提示文案 */
  emptyText?: string;
  /** 行 key 函数（可选），默认使用 index */
  rowKey?: (row: T, index: number) => string | number;
  /** 外层容器 className */
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  title,
  emptyText = "暂无数据",
  rowKey,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={
        className ??
        "bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      }
    >
      {title && (
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={
                    col.headerClassName ??
                    "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  }
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={rowKey ? rowKey(row, rowIndex) : rowIndex}
                  className="hover:bg-gray-50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.className ??
                        "px-6 py-4 whitespace-nowrap text-sm text-gray-700"
                      }
                    >
                      {col.render
                        ? col.render(row, rowIndex)
                        : // @ts-ignore
                          (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
