import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  build: { sourcemap: true, minify: false },
  server:{
  proxy:{
   "/app": {
        target: "https://status.lab.mli",  // ✅ HTTPS backend
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "wss://status.lab.mli/socket.io/",
        ws: true,
        changeOrigin: true,
      },
            "/api": {
        target: "https://status.lab.mli/api/v1",  // Your backend URL
        changeOrigin: true,
        secure: false,
        ws: true,
        // ✅ Log for debugging
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 Proxying:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📦 Proxy response:', proxyRes.statusCode, req.url);
          });
        },
      },
    "/socket.io": {
      target: "ws://192.168.100.185:5050",  // ✅ Use the correct target
    ws: true,
    changeOrigin: true,
    secure: false,
},

  },
  // npx vite build
  host:"0.0.0.0",
  port:5052,
  allowedHosts: [
        "0.0.0.0",
        "localhost",
        "127.0.0.1",
        "192.168.100.185",
        "status.lab.mli",        // ✅ ADD THIS
        "www.status.lab.mli",    // ✅ ADD THIS
        ".lab.mli",
                      // ✅ ADD THIS (wildcard for all subdomains)
      ],
      fs:{
        strict:true,
            allow: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '.'),
      ],  
      },
    //   cors: {
    //   origin: [
    //     "http://192.168.100.185:5052",
    //     "http://localhost:5052",
    //     "http://127.0.0.1:5052",
    //     "http://192.168.100.185:5050",
    //     "http://localhost:5050",
    //     "http://127.0.0.1:5050",
    //     "https://status.lab.mli/api/v1",
    //     "https://status.lab.mli",
    //     "http://localhost:9090",
    //      "http://192.168.100.185:9090",
    //   ],
    //   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    //   allowedHeaders: [
    //     "Content-Type",
    //     "Authorization",
    //     "X-Requested-With",
    //     "Accept",
    //     "Origin",
    //     "Access-Control-Allow-Origin",
    //     "Access-Control-Allow-Headers",
    //   ],
    //   exposedHeaders: ["Authorization"],
    //   credentials: true,
    //   maxAge: 86400,
    // },
  },
    optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@mui/icons-material',
      // Add other dependencies here
    ],
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    
    rollupOptions: {
      
      output: {
        manualChunks: {
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-charts': ['echarts', 'echarts-for-react'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-utils': ['axios', 'zod', 'zustand', 'react-hook-form'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
