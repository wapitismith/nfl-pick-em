import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Deployed under https://wapitismith.com/pickem/
  base: '/pickem/',
})
