// src/components/inpatient/InpatientToolbar.tsx
import type { CompareKind } from "./LineChart";

interface Props {
  viewMode: "details" | "chart";
  onChangeView: (mode: "details" | "chart") => void;
  compare: CompareKind;
  onChangeCompare: (kind: CompareKind) => void;
}

export default function InpatientToolbar({
  viewMode,
  onChangeView,
  compare,
  onChangeCompare,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg overflow-hidden border text-sm">
        <button
          type="button"
          onClick={() => onChangeView("details")}
          className={`px-3 py-1 ${
            viewMode === "details"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700"
          }`}
        >
          数据详情
        </button>
        <button
          type="button"
          onClick={() => onChangeView("chart")}
          className={`px-3 py-1 ${
            viewMode === "chart"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700"
          }`}
        >
          趋势分析
        </button>
      </div>

      {viewMode === "chart" && (
        <div className="inline-flex rounded-lg overflow-hidden border text-sm">
          <button
            type="button"
            onClick={() => onChangeCompare("yoy")}
            className={`px-3 py-1 ${
              compare === "yoy"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            同比
          </button>
          <button
            type="button"
            onClick={() => onChangeCompare("mom")}
            className={`px-3 py-1 ${
              compare === "mom"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            环比
          </button>
        </div>
      )}
    </div>
  );
}
