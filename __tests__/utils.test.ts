import { expect, test } from '@jest/globals'
import { addPlatformHint, toSemVer } from '../src/utils'

test('convert version', async () => {
  for (const inputAndExpectedOutput of [
    ['22', '22.0.0'],
    ['22.0', '22.0.0'],
    ['22.0.0', '22.0.0'],
    ['22.0.0.2', '22.0.0-2'],
    ['22-ea', '22.0.0-ea'],
    ['22.0-ea', '22.0.0-ea'],
    ['22.0.0-ea', '22.0.0-ea']
  ]) {
    expect(toSemVer(inputAndExpectedOutput[0])).toBe(inputAndExpectedOutput[1])
  }
})

test('convert invalid version', async () => {
  for (const input of ['dev', 'abc', 'a.b.c']) {
    let error = new Error('unexpected')
    try {
      toSemVer(input)
    } catch (err) {
      if (!(err instanceof Error)) {
        throw new Error('Unexpected non-Error', { cause: err })
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Unable to convert')
  }
})

test('add hint for Windows on ARM64', async () => {
  const message =
    "Failed to download graalvm-community-jdk-25.0.1_windows-aarch64_bin.zip. Are you sure java-version: '25.0.1' is correct?"
  expect(addPlatformHint(message, 'win32', 'arm64')).toContain('GraalVM is not available for Windows on ARM64 yet')
  expect(addPlatformHint(message, 'win32', 'arm64')).toContain(message)
  for (const [platform, arch] of [
    ['win32', 'x64'],
    ['linux', 'arm64'],
    ['darwin', 'arm64']
  ]) {
    expect(addPlatformHint(message, platform, arch)).toBe(message)
  }
})
