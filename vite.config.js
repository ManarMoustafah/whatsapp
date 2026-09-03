import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react()],
  base: '/whatsapp/', 
})












// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'
// import { nodePolyfills } from 'vite-plugin-node-polyfills'

// export default defineConfig({
//   plugins: [
//     react(),
//     nodePolyfills({
//       protocolImports: true,
//     }),
//   ],
//   base: '/whatsapp/', 
// })
