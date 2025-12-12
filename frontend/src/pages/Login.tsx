import React, { useState, useEffect } from 'react';

const LoginPage = () => {
  const [loginData, setLoginData] = useState({
    userCode: '',
    password: '',
    captcha: ''
  });
  const [message, setMessage] = useState({ type: '', text: '请输入验证码' });
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaKey, setCaptchaKey] = useState('');

  // 生成13位随机验证码key
  const generateCaptchaKey = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  // 获取验证码
  const fetchCaptcha = async () => {
    const key = generateCaptchaKey();
    setCaptchaKey(key);
    try {
      const response = await fetch(`/sys/randomImage/${key}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success && data.result) {
          setCaptchaImage(data.result);
        } else {
          setCaptchaImage(`https://dummyimage.com/120x40/667eea/ffffff.png&text=${key.substring(0, 4)}`);
        }
      } else {
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
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '请求失败' }));
        throw new Error(JSON.stringify({ status: response.status, message: errorData.message }));
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength === '0' || response.status === 204) {
        return { success: true, message: '操作成功', code: 0 };
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        return result;
      } else {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          return { success: true, message: text || '操作成功', code: 0 };
        }
      }
    } catch (error) {
      // 检查是否是自定义错误信息
      if (error.message && error.message.includes('status')) {
        const errorObj = JSON.parse(error.message);
        if (errorObj.status === 201) {
          throw new Error('验证码错误，请重新输入');
        } else {
          throw new Error(errorObj.message || '请求失败');
        }
      }
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
      if (!loginData.userCode || !loginData.password || !loginData.captcha) {
        setMessage({ type: 'error', text: '请填写所有字段' });
        return;
      }

      const response = await apiCall('/sys/login', {
        ...loginData,
        checkKey: captchaKey
      });

      // 检查响应中的错误情况，特别是code为201的情况
      if (response.code === 201 || (response.message && response.message.includes('验证码'))) {
        // 验证码错误，自动刷新验证码
        setMessage({ type: 'error', text: '验证码错误，请重新输入' });
        setTimeout(() => {
          fetchCaptcha();
          setLoginData({...loginData, captcha: ''});
        }, 1000);
      } else if (response.success) {
        // 登录成功，保存用户信息到localStorage
        localStorage.setItem('userCode', loginData.userCode);
        if(response.token) {
          localStorage.setItem('token', response.token);
        }

        setMessage({ type: 'success', text: response.message || '登录成功' });
        // 登录成功后跳转到主页
        setTimeout(() => {
          window.location.href = '/home';
        }, 1000);
      } else {
        // 检查错误信息中是否包含验证码相关的错误
        if (response.message && (response.message.toLowerCase().includes('验证码') || response.message.toLowerCase().includes('captcha') || response.message.toLowerCase().includes('code'))) {
          // 验证码错误，自动刷新验证码
          setMessage({ type: 'error', text: '验证码错误，请重新输入' });
          setTimeout(() => {
            fetchCaptcha();
            setLoginData({...loginData, captcha: ''});
          }, 1000);
        } else {
          setMessage({ type: 'error', text: response.message || '登录失败' });
        }
      }
    } catch (error) {
      // 检查错误信息中是否包含验证码相关的错误
      if (error.message === '验证码错误，请重新输入') {
        setMessage({ type: 'error', text: error.message });
        setTimeout(() => {
          fetchCaptcha();
          setLoginData({...loginData, captcha: ''});
        }, 1000);
      } else if (error.message && (error.message.toLowerCase().includes('验证码') || error.message.toLowerCase().includes('captcha') || error.message.toLowerCase().includes('code'))) {
        setMessage({ type: 'error', text: '验证码错误，请重新输入' });
        setTimeout(() => {
          fetchCaptcha();
          setLoginData({...loginData, captcha: ''});
        }, 1000);
      } else {
        setMessage({ type: 'error', text: error.message || '登录失败' });
      }
    }
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
                  src={captchaImage || `https://dummyimage.com/120x40/667eea/ffffff.png&text=LOAD`}
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

          {/* 消息显示 */}
          {message.text && (
            <div
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
              {message.text || '操作信息'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;