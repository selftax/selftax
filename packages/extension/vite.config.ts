import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        // Copy manifest.json to dist
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(distDir, 'manifest.json'),
        );
        // Copy popup.html to dist
        copyFileSync(
          resolve(__dirname, 'popup.html'),
          resolve(distDir, 'popup.html'),
        );
        // Copy pdfSetup module (loads pdfjs-dist for popup PDF extraction)
        const pdfSetupSrc = resolve(__dirname, 'pdfSetup.mjs');
        if (existsSync(pdfSetupSrc)) {
          copyFileSync(pdfSetupSrc, resolve(distDir, 'pdfSetup.mjs'));
        }
        // Copy pdf.js library + worker to dist (needed for PDF extraction in popup)
        const pdfSrc = resolve(__dirname, '../../node_modules/pdfjs-dist/build/pdf.min.mjs');
        const workerSrc = resolve(__dirname, '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
        if (existsSync(pdfSrc)) {
          copyFileSync(pdfSrc, resolve(distDir, 'pdf.min.mjs'));
        }
        if (existsSync(workerSrc)) {
          copyFileSync(workerSrc, resolve(distDir, 'pdf.worker.min.mjs'));
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@selftax/core': resolve(__dirname, '../tax-core/src'),
      '@selftax/web': resolve(__dirname, '../web/src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.ts'),
        popupProcessing: resolve(__dirname, 'src/popupProcessing.ts'),
        background: resolve(__dirname, 'background.ts'),
        'content/freeFileAutoFill': resolve(
          __dirname,
          'src/content/freeFileAutoFill.ts',
        ),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
