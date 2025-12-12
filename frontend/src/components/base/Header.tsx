import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

// 标签页组件
const TabBar = ({ tabs, activeTab, onTabClick, onTabClose }) => {
  return (
    <div className="bg-white border-b border-gray-200 px-6">
      <div className="flex items-center overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center px-4 py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="text-sm font-medium whitespace-nowrap">{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Header({ title, subtitle }: HeaderProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const navigate = useNavigate();

  // 标签页状态
  const [tabs, setTabs] = useState([
    { id: 'home', name: '首页', path: '/' },
    { id: 'dashboard', name: title, path: '/dashboard' }
  ]);
  const [activeTabId, setActiveTabId] = useState('dashboard');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000); // 每秒更新一次

    return () => clearInterval(timer);
  }, []);

  const handleHomeClick = () => {
    navigate('/');
  };

  // 标签页操作
  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    if (tabId === 'home') {
      navigate('/');
    }
  };

  const handleTabClose = (tabId: string) => {
    if (tabs.length > 1) {
      const newTabs = tabs.filter(tab => tab.id !== tabId);
      setTabs(newTabs);
      
      // 如果关闭的是当前激活的标签页，则激活最后一个标签页
      if (tabId === activeTabId) {
        const newActiveTab = newTabs[newTabs.length - 1];
        setActiveTabId(newActiveTab.id);
        if (newActiveTab.id === 'home') {
          navigate('/');
        }
      }
    }
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      {/* 页面路径栏 - 现在放在上面 */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              {currentDate.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
            <button
              onClick={handleHomeClick}
              className="w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              title="返回首页"
            >
              <i className="ri-home-line text-white text-sm"></i>
            </button>
          </div>
        </div>
      </div>

       {/*标签页栏 - 现在放在下面*/}
      {/*<TabBar*/}
      {/*  tabs={tabs}*/}
      {/*  activeTab={activeTabId}*/}
      {/*  onTabClick={handleTabClick}*/}
      {/*  onTabClose={handleTabClose}*/}
      {/*/>*/}
    </div>
  );
}