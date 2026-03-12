// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import * as path from 'node:path'

const minimatchCommonJS = path.resolve(
  process.cwd(),
  'node_modules/@actions/glob/node_modules/minimatch/dist/cjs/index-cjs.js'
)

const forceMinimatchCommonJS = {
  name: 'force-minimatch-commonjs',
  resolveId(source) {
    if (source === 'minimatch') {
      return minimatchCommonJS
    }

    return null
  }
}

const config = {
  input: 'src/cleanup.ts',
  output: {
    esModule: true,
    file: 'dist/cleanup.js',
    format: 'es',
    sourcemap: false
  },
  plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs(), json(), forceMinimatchCommonJS]
}

export default config
