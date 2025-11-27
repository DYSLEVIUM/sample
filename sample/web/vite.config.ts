import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';

// Custom plugin to copy model directories to dist
function copyModelsPlugin(): Plugin {
  return {
    name: 'copy-models',
    closeBundle() {
      const modelDirs = ['rnnoise', 'deepfilternet'];
      
      modelDirs.forEach((dir) => {
        const srcDir = resolve(__dirname, dir);
        const destDir = resolve(__dirname, 'dist', dir);
        
        if (existsSync(srcDir)) {
          mkdirSync(destDir, { recursive: true });
          
          readdirSync(srcDir).forEach((file) => {
            copyFileSync(resolve(srcDir, file), resolve(destDir, file));
          });
          
          console.log(`✓ Copied ${dir}/ to dist/${dir}/`);
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Base URL: Use VITE_BASE_PATH env var, or '/sample/' for production, or '/' for dev
  base: process.env.VITE_BASE_PATH || (command === 'build' ? '/sample/' : '/'),
  
  plugins: [copyModelsPlugin()],
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  
  server: {
    port: 8080,
    open: true,
  },
  
  // Ensure WASM files and other assets are properly handled
  assetsInclude: ['**/*.wasm', '**/*.tar.gz'],
  
  publicDir: 'public',
}));

