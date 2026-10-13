import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Keep core Three.js and its example modules inside one pre-bundled graph.
    // This avoids a second dev-only module instance when TextGeometry is added.
    include: [
      'three',
      'three/addons/geometries/TextGeometry.js',
      'three/addons/loaders/FontLoader.js',
      'three/addons/loaders/GLTFLoader.js',
    ],
  },
})
