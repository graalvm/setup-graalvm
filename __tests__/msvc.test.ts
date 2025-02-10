import * as path from 'path'
import { expect, test } from '@jest/globals'
import { needsWindowsEnvironmentSetup } from '../src/msvc'
import { VERSION_DEV, VERSION_LATEST } from '../src/constants'

process.env['RUNNER_TOOL_CACHE'] = path.join(__dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('decide whether Window env must be set up for GraalVM for JDK', async () => {
  for (const javaVersion of ['17', '17.0.8', '17.0', '21', '22', '22-ea', '23-ea', VERSION_DEV]) {
    expect(needsWindowsEnvironmentSetup(javaVersion, '', true)).toBe(false)
  }
})

test('decide whether Window env must be set up for legacy GraalVM', async () => {
  for (const combination of [
    ['7', '22.3.0'],
    ['17', '22.3'],
    ['7', '22.3'],
    ['7', VERSION_DEV],
    ['17', VERSION_LATEST]
  ]) {
    expect(needsWindowsEnvironmentSetup(combination[0], combination[1], false)).toBe(combination[1] !== VERSION_DEV)
  }
})
