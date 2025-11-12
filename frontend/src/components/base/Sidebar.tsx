import React, { useState } from 'react';

interface MenuItem {
  id: string;
  title: string;
  icon: string;
  children?: MenuItem[];
}

interface SidebarProps {
  menuItems: MenuItem[];
  onMenuClick: (menuId: string) => void;
  activeMenu: string;
}

export default function Sidebar({ menuItems, onMenuClick, activeMenu }: SidebarProps) {
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  
  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuId) 
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const renderMenuItem = (item: MenuItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.id);
    const isActive = activeMenu === item.id;

    return (
      <div key={item.id} className="mb-1">
        <div
          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-200 ${
            level === 0 
              ? 'hover:bg-blue-50 border-l-4 border-transparent hover:border-blue-500' 
              : level === 1
                ? 'hover:bg-gray-50 ml-4'
                : 'hover:bg-gray-50 ml-8'
          } ${
            isActive 
              ? level === 0 
                ? 'bg-blue-50 border-l-4 border-blue-500 text-blue-600' 
                : 'bg-gray-100 text-blue-600'
              : 'text-gray-700'
          }`}
          onClick={() => {
            if (hasChildren) {
              toggleMenu(item.id);
            } else {
              onMenuClick(item.id);
            }
          }}
        >
          <div className="flex items-center">
            <i className={`${item.icon} mr-3 ${level === 0 ? 'text-lg' : level === 1 ? 'text-base' : 'text-sm'}`}></i>
            <span className={`${level === 0 ? 'font-medium' : level === 1 ? 'text-sm' : 'text-xs'}`}>
              {item.title}
            </span>
          </div>
          {hasChildren && (
            <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line text-gray-400`}></i>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div className={level === 0 ? 'bg-gray-50' : 'bg-gray-100'}>
            {item.children?.map(child => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 bg-white shadow-lg h-screen overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center bg-blue-600 rounded-lg mr-3">
            <i className="ri-hospital-line text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">医院运营指标分析</h1>
            <p className="text-xs text-gray-500">Hospital Analytics</p>
          </div>
        </div>
      </div>
      
      <nav className="py-4">
        {menuItems.map(item => renderMenuItem(item))}
        {/* 删除硬编码的转诊人次菜单项 */}
      </nav>
    </div>
  );
}