import React from 'react';

interface DataCardProps {
  title: string;
  value?: string | number;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  error?: string;
}

export default function DataCard({ title, value, icon, trend, loading, error }: DataCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="w-8 h-8 bg-gray-200 rounded"></div>
          </div>
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          <div className="w-8 h-8 flex items-center justify-center bg-red-100 rounded">
            <i className="ri-error-warning-line text-red-500"></i>
          </div>
        </div>
        <div className="text-sm text-red-600">数据加载失败</div>
        <div className="text-xs text-gray-400 mt-1">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className="w-8 h-8 flex items-center justify-center bg-blue-100 rounded">
          <i className={`${icon} text-blue-600`}></i>
        </div>
      </div>
      
      <div className="mb-2">
        {value !== undefined ? (
          <div className="text-2xl font-bold text-gray-900">{value}</div>
        ) : (
          <div className="text-sm text-gray-500">暂无数据</div>
        )}
      </div>
      
      {trend && (
        <div className="flex items-center text-xs">
          <i className={`ri-arrow-${trend.isPositive ? 'up' : 'down'}-line mr-1 ${
            trend.isPositive ? 'text-green-500' : 'text-red-500'
          }`}></i>
          <span className={trend.isPositive ? 'text-green-600' : 'text-red-600'}>
            {Math.abs(trend.value)}%
          </span>
          <span className="text-gray-500 ml-1">较上期</span>
        </div>
      )}
    </div>
  );
}
