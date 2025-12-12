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
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data:; style-src * 'unsafe-inline'; img-src * data: blob:;"
    },
    hmr: {
      overlay: false
    },
    // 添加代理配置，解决跨域问题
    proxy: {
      // 代理到 http://120.26.34.178:8080/api/sys/
      '/sys': {
        target: 'http://120.26.34.178:8080/api/sys/',
        changeOrigin: true,
        secure: false,
        // 重写路径，去掉 /sys 前缀，使其正确映射到后端API
        rewrite: (path) => path.replace(/^\/sys/, '')
      },
      '/api': {
        target: 'http://127.0.0.1:5010',
        changeOrigin: true,
        secure: false,
      },
    }
  }
})