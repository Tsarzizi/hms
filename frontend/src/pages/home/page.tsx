import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 获取登录时保存的userCode作为用户名
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // 检查是否有userCode（登录时使用的字段）
    const storedUserCode = localStorage.getItem('userCode');
    const token = localStorage.getItem('token');
    console.log('Token检查:', { token: token ? '存在' : '缺失', userCode: storedUserCode ? '存在' : '缺失' });
    // 如果有userCode，使用它作为用户名
    if (storedUserCode) {
      setUsername(storedUserCode);
    } else if (localStorage.getItem('username')) {
      // 如果没有userCode但有username，使用username
      setUsername(localStorage.getItem('username'));
    } else {
      // 如果都没有，重定向到登录页
      navigate('/login', { replace: true });
      return;
    }
  }, [navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    // 清除本地存储的用户信息
    localStorage.removeItem('userCode');
    localStorage.removeItem('username');
    localStorage.removeItem('token');
    // 重定向到登录页面
    navigate('/login');
  };

  const handlePasswordChange = () => {
    // 导航到修改密码页面
    navigate('/change-password');
  };

  // 如果还在加载或未获取到用户名，可显示加载状态或直接由上层逻辑处理跳转
  if (username === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">正在验证登录状态...</p>
        </div>
      </div>
    );
  }

  const mainModules = [
    {
      title: '医疗服务',
      description: '门急诊、住院、转诊、体检等医疗服务数据分析',
      icon: 'ri-service-line',
      color: 'blue',
      path: '/dashboard?module=medical-services',
      subItems: ['门急诊服务', '住院服务', '转诊服务', '体检服务']
    },
    {
      title: '医疗质量安全',
      description: '患者安全、诊断质量、医疗事故等质量管控',
      icon: 'ri-shield-check-line',
      color: 'green',
      path: '/dashboard?module=medical-quality',
      subItems: ['患者安全', '诊断质量', '医技质量', '手术质量']
    },
    {
      title: '医疗效率',
      description: '床位效率、医生效率等运营效率分析',
      icon: 'ri-speed-line',
      color: 'purple',
      path: '/dashboard?module=medical-efficiency',
      subItems: ['床位效率', '医生效率']
    },
    {
      title: '医院收入情况',
      description: '门急诊、住院、体检收入统计与分析',
      icon: 'ri-money-dollar-circle-line',
      color: 'orange',
      path: '/dashboard?module=hospital-revenue',
      subItems: ['门急诊收入', '住院收入', '体检收入']
    },
    {
      title: '医疗负担',
      description: '医疗费用、药费情况等负担分析',
      icon: 'ri-funds-line',
      color: 'red',
      path: '/dashboard?module=medical-burden',
      subItems: ['门急诊费用', '住院费用', '药费分析']
    },
    {
      title: '医疗资源',
      description: '人员配置、床位、设备等资源管理',
      icon: 'ri-building-2-line',
      color: 'indigo',
      path: '/dashboard?module=medical-resources',
      subItems: ['医疗人员', '床位管理', '资源配置']
    }
  ];

  const additionalModules = [
    { title: '用药管理', icon: 'ri-capsule-line', color: 'teal', path: '/dashboard?module=medication-management' },
    { title: '输血管理', icon: 'ri-drop-line', color: 'pink', path: '/dashboard?module=blood-management' },
    { title: '财务管理', icon: 'ri-calculator-line', color: 'yellow', path: '/dashboard?module=financial-management' },
    { title: '医疗保障', icon: 'ri-shield-user-line', color: 'cyan', path: '/dashboard?module=medical-insurance' }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-500 text-white',
      green: 'bg-green-500 text-white',
      purple: 'bg-purple-500 text-white',
      orange: 'bg-orange-500 text-white',
      red: 'bg-red-500 text-white',
      indigo: 'bg-indigo-500 text-white',
      teal: 'bg-teal-500 text-white',
      pink: 'bg-pink-500 text-white',
      yellow: 'bg-yellow-500 text-white',
      cyan: 'bg-cyan-500 text-white'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getBgColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      green: 'bg-green-50 border-green-200 hover:bg-green-100',
      purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      orange: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
      red: 'bg-red-50 border-red-200 hover:bg-red-100',
      indigo: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
      teal: 'bg-teal-50 border-teal-200 hover:bg-teal-100',
      pink: 'bg-pink-50 border-pink-200 hover:bg-pink-100',
      yellow: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
      cyan: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div
        className="relative bg-gradient-to-r from-blue-600 to-blue-800 text-white"
        style={{
          backgroundImage: `url('https://readdy.ai/api/search-image?query=Modern%20hospital%20interior%20with%20clean%20white%20corridors%2C%20medical%20equipment%2C%20professional%20healthcare%20environment%2C%20bright%20lighting%2C%20contemporary%20medical%20facility%20design%2C%20sterile%20and%20organized%20atmosphere&width=1920&height=600&seq=hospital-hero-bg&orientation=landscape')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundBlendMode: 'overlay'
        }}
      >
        <div className="absolute inset-0 bg-blue-900/70"></div>
        <div className="relative max-w-7xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 flex items-center justify-center bg-white/20 rounded-full mr-4">
                <i className="ri-hospital-line text-3xl"></i>
              </div>
              <div className="text-left">
                <h1 className="text-4xl font-bold mb-2">医院运营指标分析系统</h1>
                <p className="text-xl text-blue-100">Hospital Operations Analytics Platform</p>
              </div>
            </div>
            <p className="text-lg text-blue-100 mb-8 max-w-3xl mx-auto">
              实时监控医院运营数据，提供全面的医疗服务分析、质量安全管控、效率优化和收入管理解决方案
            </p>
            <div className="flex items-center justify-center space-x-8 text-sm">
              <div className="flex items-center">
                <i className="ri-time-line mr-2"></i>
                <span>实时更新：{currentTime.toLocaleTimeString('zh-CN')}</span>
              </div>
              <div className="flex items-center">
                <i className="ri-calendar-line mr-2"></i>
                <span>{currentTime.toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long'
                })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Main Modules */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">核心功能模块</h2>

            {/* 用户操作菜单 - 使用登录时的真实用户名 */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-user-line mr-2"></i>
                <span>{username}</span>
                <i className={`ri-arrow-down-s-line ml-2 transition-transform ${showDropdown ? 'rotate-180' : ''}`}></i>
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-1">
                    <button
                      onClick={handlePasswordChange}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <i className="ri-lock-line mr-2"></i>
                      修改密码
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <i className="ri-logout-box-line mr-2"></i>
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mainModules.map((item, index) => (
              <div 
                key={index} 
                className={`rounded-lg border-2 p-6 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105 ${getBgColorClasses(item.color)}`}
                onClick={() => navigate(item.path)}
              >
                <div className="flex items-start mb-4">
                  <div className={`w-12 h-12 flex items-center justify-center rounded-lg mr-4 ${getColorClasses(item.color)}`}>
                    <i className={`${item.icon} text-xl`}></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                  </div>
                  <i className="ri-arrow-right-line text-gray-400 ml-2"></i>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.subItems.map((subItem, subIndex) => (
                    <span 
                      key={subIndex}
                      className="px-2 py-1 bg-white/80 text-xs text-gray-600 rounded-full border"
                    >
                      {subItem}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Modules */}
        <div className="mb-12">
          <h3 className="text-xl font-semibold text-gray-800 mb-6">其他功能模块</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {additionalModules.map((item, index) => (
              <div 
                key={index}
                className={`rounded-lg border p-4 cursor-pointer hover:shadow-md transition-all duration-200 ${getBgColorClasses(item.color)}`}
                onClick={() => navigate(item.path)}
              >
                <div className="flex items-center">
                  <div className={`w-8 h-8 flex items-center justify-center rounded mr-3 ${getColorClasses(item.color)}`}>
                    <i className={`${item.icon} text-sm`}></i>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{item.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 系统状态 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-800">系统状态</h3>
            <div className="flex items-center text-yellow-600">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
              <span className="text-sm">部分功能待完善</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">数据库连接</span>
              <div className="flex items-center text-yellow-600">
                <i className="ri-time-line mr-1"></i>
                <span className="text-sm">待配置</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">前端系统</span>
              <div className="flex items-center text-green-600">
                <i className="ri-checkbox-circle-line mr-1"></i>
                <span className="text-sm">正常</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">后端服务</span>
              <div className="flex items-center text-yellow-600">
                <i className="ri-code-line mr-1"></i>
                <span className="text-sm">开发中</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">数据同步</span>
              <span className="text-sm text-gray-500">待启用</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default HomePage;