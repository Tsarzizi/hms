import React, { useState, useEffect } from 'react';

const ChangePasswordPage = () => {
  const [changePasswordData, setChangePasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isCheckingLogin, setIsCheckingLogin] = useState(true);

  // 检查登录状态 - 使用userCode验证
  useEffect(() => {
    const userCode = localStorage.getItem('userCode');

    console.log('登录验证:', { userCode: userCode ? '存在' : '缺失' });

    if (!userCode) {
      setMessage({ type: 'error', text: '未检测到登录信息，请重新登录' });
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else {
      // 登录状态正常，继续显示页面
      setMessage({ type: 'info', text: '请修改您的密码' });
    }

    setIsCheckingLogin(false);
  }, []);

  // 如果正在检查登录状态，显示加载状态
  if (isCheckingLogin) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f7fafc',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #667eea',
            borderTop: '4px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: '#4a5568' }}>正在验证登录状态...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // 返回主页
  const goHome = () => {
    window.location.href = '/'; // 或者使用 history.push('/') 如果使用React Router
  };

  // API调用函数 - 暂时使用userCode验证，保留token验证代码
  const apiCall = async (url, data, method = 'POST') => {
    try {
      // 检查登录状态
      const userCode = localStorage.getItem('userCode');
      if (!userCode) {
        throw new Error('未检测到登录信息，请重新登录');
      }

      // 保留token验证代码，但暂时不强制要求
      const token = localStorage.getItem('token');
      let formattedToken = null;
      if (token) {
        formattedToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }

      const headers = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // 添加请求头标识
      };

      // 如果有token，添加到请求头
      if (formattedToken) {
        headers['Authorization'] = formattedToken;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
      if (error.name === 'TypeError' && error.message.includes('JSON')) {
        throw new Error('服务器响应格式错误，请联系管理员');
      }
      throw error;
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

      // 检查响应中的错误情况
      if (response.code === 510) {
        setMessage({ type: 'error', text: 'Token失效，请重新登录' });
        // 清除本地存储的用户信息
        localStorage.removeItem('token');
        localStorage.removeItem('userCode');
        // 重定向到登录页面
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (response.success) {
        setMessage({ type: 'success', text: response.message || '密码修改成功' });
        setChangePasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setMessage({ type: 'error', text: response.message || '修改密码失败' });
      }
    } catch (error) {
      // 检查错误信息是否包含token相关错误
      if (error.message && error.message.includes('Token')) {
        setMessage({ type: 'error', text: error.message });
        localStorage.removeItem('token');
        localStorage.removeItem('userCode');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setMessage({ type: 'error', text: error.message || '修改密码失败' });
      }
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

      {/* Header Section */}
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

      {/* Change Password Form - Centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        position: 'relative',
        paddingTop: '2rem',
        paddingBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: '400px'
        }}>
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
                    width: `${(passwordStrength / 5) * 100 || 0}%`,
                    backgroundColor: passwordStrength <= 2 ? '#dc3545' : passwordStrength <= 4 ? '#ffc107' : '#28a745',
                    transition: 'width 0.3s ease'
                  }}
                ></div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                {passwordStrength === 0 && '请输入至少6位密码'}
                {passwordStrength > 0 && passwordStrength <= 2 && '密码强度较弱'}
                {passwordStrength > 2 && passwordStrength <= 4 && '密码强度中等'}
                {passwordStrength === 5 && '密码强度强'}
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

            {/* 修改密码按钮和返回按钮并排显示 */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.3s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6fd8'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#667eea'}
              >
                修改密码
              </button>

              <button
                type="button"
                onClick={goHome}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.3s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6268'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#6c757d'}
              >
                返回
              </button>
            </div>
          </form>

          {/* 消息显示 */}
          {message.text && message.text !== '' && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: message.type === 'success' ? '#d4edda' : message.type === 'error' ? '#f8d7da' : '#d1ecf1',
                color: message.type === 'success' ? '#155724' : message.type === 'error' ? '#721c24' : '#0c5460',
                border: `2px solid ${message.type === 'success' ? '#c3e6cb' : message.type === 'error' ? '#f5c6cb' : '#bee5eb'}`,
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

export default ChangePasswordPage;