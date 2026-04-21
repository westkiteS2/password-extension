import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' // manifest.json 파일이 루트에 있어야 합니다

export default defineConfig({
  plugins: [crx({ manifest })],
})
