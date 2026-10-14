import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { backgroundFilesPlugin } from './vite-background-files-plugin.ts'
import { emulatorPlugin } from './vite-emulator-plugin.ts'
import { exportGfxPlugin } from './vite-export-gfx-plugin.ts'
import { tilesetFilesPlugin } from './vite-tileset-files-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), exportGfxPlugin(), tilesetFilesPlugin(), backgroundFilesPlugin(), emulatorPlugin()],
})
