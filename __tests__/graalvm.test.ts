import * as path from 'path'
import * as graalvm from '../src/graalvm'
import {expect, test} from '@jest/globals'

process.env['RUNNER_TOOL_CACHE'] = path.join(__dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('request invalid version/javaVersion', async () => {
  for (var combination of [
    ['22.3.0', '7'],
    ['22.3', '17'],
    ['22.3', '7']
  ]) {
    let error = new Error('unexpected')
    try {
      await graalvm.setUpGraalVMRelease('', combination[0], combination[1])
    } catch (err) {
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Failed to download')
    expect(error.message).toContain('Are you sure version')
  }
})
