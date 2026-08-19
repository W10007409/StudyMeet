// defineConfig 는 'vitest/config' 에서 가져온다. 'vite' 쪽에는 test 필드 타입이 없어
// tsc 가 TS2769 로 죽는다. TypeScript 버전과 무관한 문제다.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
