import React, { useState, useEffect } from 'react';

const LoginPage = () => {
  const [activeTab, setActiveTab] = useState('login');
  const [loginData, setLoginData] = useState({
    userCode: '',
    password: '',
    captcha: '',
    checkKey: ''
  });
  const [changePasswordData, setChangePasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState({ type: '', text: '请输入验证码' });
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaKey, setCaptchaKey] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);

  // 生成13位随机验证码key
  const generateCaptchaKey = () => {
    return Math.random().toString(36).substring(2, 15); // 生成13位随机字符串
  };

  // 获取验证码
  const fetchCaptcha = async () => {
    const key = generateCaptchaKey();
    setCaptchaKey(key);
    // 调用真实的API获取验证码
    try {
      // 发送请求并获取响应对象
      const response = await fetch(`/sys/randomImage/${key}`);

      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 获取响应内容类型
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        // 如果是JSON响应，解析为JSON
        const data = await response.json();
        if (data.success && data.result) {
          // API返回的是路径字符串，直接使用
          setCaptchaImage(data.result);
        } else {
          // 如果API调用失败，使用占位符图片
          setCaptchaImage(`https://dummyimage.com/120x40/667eea/ffffff.png&text=${key.substring(0, 4)}`);
        }
      } else {
        // 如果不是JSON响应，假定是图片数据
        // 将响应转换为base64编码，避免blob URL的CSP问题
        const arrayBuffer = await response.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        const imageUrl = `data:${contentType};base64,${base64}`;
        setCaptchaImage(imageUrl);
      }
    } catch (error) {
      console.error('获取验证码失败:', error);
      // 出错时使用占位符图片
      setCaptchaImage(`https://dummyimage.com/120x40/667eea/ffffff.png&text=${key.substring(0, 4)}`);
      setMessage({ type: 'error', text: '验证码加载失败，请刷新重试' });
    }
  };

  // 页面加载时获取验证码
  useEffect(() => {
    fetchCaptcha();
  }, []);

  // API调用函数
  const apiCall = async (url, data, method = 'POST') => {
    try {
      // 实际API调用
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 检查响应是否有内容
      const contentLength = response.headers.get('content-length');
      if (contentLength === '0' || response.status === 204) {
        // 如果响应为空，返回默认的成功结果
        return { success: true, message: '操作成功', code: 0 };
      }

      // 获取响应内容类型
      const contentType = response.headers.get('content-type');

      // 如果响应是JSON类型，则解析JSON
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        return result;
      } else {
        // 如果不是JSON响应，尝试解析为文本
        const text = await response.text();
        try {
          // 尝试解析为JSON
          return JSON.parse(text);
        } catch (e) {
          // 如果无法解析为JSON，返回默认格式
          return { success: true, message: text || '操作成功', code: 0 };
        }
      }
    } catch (error) {
      // 如果网络请求失败或解析失败，抛出错误
      if (error.name === 'TypeError' && error.message.includes('JSON')) {
        throw new Error('服务器响应格式错误，请联系管理员');
      }
      throw error;
    }
  };

  // 登录处理
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // 验证表单数据
      if (!loginData.userCode || !loginData.password || !loginData.captcha) {
        setMessage({ type: 'error', text: '请填写所有字段' });
        return;
      }

      // 检查验证码是否正确（这里简化为与显示的验证码匹配）
      // 注意：实际应用中，验证码校验由后端完成，前端只需提交验证码和key
      const response = await apiCall('/sys/login', {
        ...loginData,
        checkKey: captchaKey // 传递验证码key给后端
      });
      if (response.success) {
        setMessage({ type: 'success', text: response.message });
        // 模拟跳转到主页
        setTimeout(() => {
          window.location.href = '/home';
        }, 1000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '登录失败' });
    }
  };

  // 修改密码处理
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      setMessage({ type: 'error', text: '新密码与确认密码不一致' });
      return;
    }

    try {
      const response = await apiCall('/sys/changePassword', changePasswordData);
      if (response.success) {
        setMessage({ type: 'success', text: response.message });
        setChangePasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '修改密码失败' });
    }
  };

  // 检查密码强度
  const checkPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;

    return Math.min(strength, 5);
  };

  // 更新密码强度
  const handleNewPasswordChange = (e) => {
    const newPassword = e.target.value;
    setChangePasswordData({ ...changePasswordData, newPassword });
    const strength = checkPasswordStrength(newPassword);
    setPasswordStrength(strength);
  };

  // 切换标签页
  const switchTab = (tab) => {
    setActiveTab(tab);
    setMessage({ type: '', text: '' });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundImage: 'url(https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* 左侧透明遮罩 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(102, 126, 234, 0.6)',
        zIndex: 1
      }}></div>

      {/* Hero Section */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '2rem 0',
          width: '100%'
        }}
      >
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 2rem',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              marginRight: '1rem'
            }}>
              <span style={{ fontSize: '2rem' }}>🔒</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem'
              }}>
                医院运营指标分析系统
              </h1>
              <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
                Hospital Operations Analytics Platform
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Login Form - Centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        position: 'relative'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: '400px'
        }}>
          {/* 标签页切换 */}
          <div style={{ display: 'flex', marginBottom: '1.5rem' }}>
            <button
              onClick={() => switchTab('login')}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '1rem',
                cursor: 'pointer',
                backgroundColor: activeTab === 'login' ? '#667eea' : '#f0f0f0',
                color: activeTab === 'login' ? 'white' : '#333',
                border: 'none',
                borderRadius: '5px 5px 0 0',
                fontWeight: 'bold'
              }}
            >
              登录
            </button>
            <button
              onClick={() => switchTab('change')}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '1rem',
                cursor: 'pointer',
                backgroundColor: activeTab === 'change' ? '#667eea' : '#f0f0f0',
                color: activeTab === 'change' ? 'white' : '#333',
                border: 'none',
                borderRadius: '5px 5px 0 0',
                fontWeight: 'bold'
              }}
            >
              修改密码
            </button>
          </div>

          {/* 登录表单 */}
          {activeTab === 'login' && (
            <div key="login-form">
              <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#333' }}>用户登录</h2>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                    用户名
                  </label>
                  <input
                    type="text"
                    value={loginData.userCode}
                    onChange={(e) => setLoginData({ ...loginData, userCode: e.target.value })}
                    required
                    placeholder="请输入用户名"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #e1e5e9',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'border-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                    onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                    密码
                  </label>
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    required
                    placeholder="请输入密码"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #e1e5e9',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'border-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                    onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                  />
                </div>
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                      验证码
                    </label>
                    <input
                      type="text"
                      value={loginData.captcha}
                      onChange={(e) => setLoginData({ ...loginData, captcha: e.target.value })}
                      required
                      placeholder="请输入验证码"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #e1e5e9',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        transition: 'border-color 0.3s ease'
                      }}
                      onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                      onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <img
                      src={captchaImage}
                      alt="验证码"
                      style={{
                        width: '100px',
                        height: '40px',
                        border: '2px solid #e1e5e9',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'border-color 0.3s ease'
                      }}
                      onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                      onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                      onClick={fetchCaptcha}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    marginTop: '1rem',
                    transition: 'background-color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6fd8'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#667eea'}
                >
                  登录
                </button>
              </form>
            </div>
          )}

          {/* 修改密码表单 */}
          {activeTab === 'change' && (
            <div key="change-form">
              <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#333' }}>修改密码</h2>
              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                    原密码
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.oldPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, oldPassword: e.target.value })}
                    required
                    placeholder="请输入原密码"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #e1e5e9',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'border-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                    onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                    新密码
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.newPassword}
                    onChange={handleNewPasswordChange}
                    required
                    placeholder="请输入新密码"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #e1e5e9',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'border-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                    onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                  />
                  <div style={{
                    height: '5px',
                    backgroundColor: '#eee',
                    marginTop: '0.5rem',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(passwordStrength / 5) * 100}%`,
                        backgroundColor: passwordStrength <= 2 ? '#dc3545' : passwordStrength <= 4 ? '#ffc107' : '#28a745',
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>
                    确认新密码
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.confirmPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, confirmPassword: e.target.value })}
                    required
                    placeholder="请再次输入新密码"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #e1e5e9',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'border-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.borderColor = '#667eea'}
                    onMouseLeave={(e) => e.target.style.borderColor = '#e1e5e9'}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    marginTop: '1rem',
                    transition: 'background-color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6fd8'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#667eea'}
                >
                  修改密码
                </button>
              </form>
            </div>
          )}

          {/* 消息显示 */}
          {message.text && (
            <div
              key="message"
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
                color: message.type === 'success' ? '#155724' : '#721c24',
                border: `2px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
                fontWeight: 'bold'
              }}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;