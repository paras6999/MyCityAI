import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Allow importing ../../shared/constants.json (enums shared with the backend and the app).
    fs: { allow: ['.', '../../shared'] },
  },
})
