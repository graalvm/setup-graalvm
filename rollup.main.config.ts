// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/main.ts',
  output: {
    esModule: true,
    file: 'dist/main.js',
    format: 'es',
    sourcemap: false
  },
  plugins: [typescript(), nodeResolve(), commonjs(), json()]
}

export default config
