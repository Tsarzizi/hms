import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const base = process.env.BASE_PATH || '/'
const isPreview = !!process.env.IS_PREVIEW;

// https://vite.dev/config/
export default defineConfig({
  root: resolve(__dirname, ''),
  publicDir: resolve(__dirname, 'public'),
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),

  },
  plugins: [
    react(),
  ],
    resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  base,
  build: {
    sourcemap: true,
    outDir: resolve(__dirname, 'out'),
  },
  server: {
    port: 5173, // 改为 Vite 默认端口 5173
    host: '0.0.0.0',
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data:; style-src * 'unsafe-inline';"
    },
    hmr: {
      overlay: false
    },
    // 添加代理配置，解决跨域问题
    proxy: {
      // 确保有这个配置
      // 门诊预约服务
      // '/api/outpatient-appointment': {
      //   target: 'http://localhost:5000',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // // 复诊情况服务
      // '/api/follow-up': {
      //   target: 'http://localhost:5001',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // // 门急诊人次服务
      // '/api/outpatient-visits': {
      //   target: 'http://localhost:5002',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // // 处方管理服务
      // '/api/prescription-management': {
      //   target: 'http://localhost:5003',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // // 特需门诊服务
      // '/api/special-clinic': {
      //   target: 'http://localhost:5004',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // // 门诊中药服务
      // '/api/tcm-service': {
      //   target: 'http://localhost:5005',
      //   changeOrigin: true,
      //   secure: false,
      // },
      // 住院总收入服务
//      '/api/inpatient_total_revenue': {
//        target: 'http://localhost:5010',
//        changeOrigin: true,
//        secure: false,
//      },
      '/api': {
        target: 'http://localhost:5010',
        changeOrigin: true,
        secure: false,
      },
    }
  }
})