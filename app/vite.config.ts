import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const pwa = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg'],
  manifest: {
    name: '여행 플래너',
    short_name: '여행 플래너',
    description: '일정, 예산, 지도 링크를 한곳에서 정리하는 여행 계획 앱',
    lang: 'ko',
    display: 'standalone',
    start_url: '.',
    scope: '.',
    theme_color: '#0f766e',
    background_color: '#f6f7f8',
    icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  },
  workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
})

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 같은 하위 경로(/NEW/)에 배포할 때만 BASE_PATH로 지정한다. 로컬 개발은 '/'.
  base: process.env.BASE_PATH || '/',
  // 서비스 워커를 쓸 수 없는 임베디드 뷰어용 단일 파일 빌드(build:single)에서는 PWA를 끈다.
  plugins: [react(), ...(process.env.NO_PWA ? [] : [pwa])],
  test: { environment: 'node' },
})
