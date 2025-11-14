// src/components/chart/ChartPanel.tsx
import React from "react";

interface ChartPanelProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({
  title,
  extra,
  children,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {(title || extra) && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
          {title && (
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          )}
          {extra && <div className="flex items-center space-x-2">{extra}</div>}
        </div>
      )}

      {children}
    </div>
  );
};
