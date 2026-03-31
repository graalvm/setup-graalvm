import * as path from 'path'
import * as mandrel from '../src/mandrel'
import { expect, test } from '@jest/globals'
import { getLatestRelease } from '../src/utils'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
process.env['RUNNER_TOOL_CACHE'] = path.join(dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(dirname, 'TEMP')

test('request invalid version/javaVersion combination', async () => {
  for (const combination of [
    ['mandrel-23.1.1.0-Final', '17'],
    ['mandrel-23.0.2.1-Final', '21']
  ]) {
    let error = new Error('unexpected')
    try {
      await mandrel.setUpMandrel(combination[0], combination[1])
    } catch (err) {
      if (!(err instanceof Error)) {
        throw new Error(`Unexpected non-Error: ${err}`)
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Failed to download')
    expect(error.message).toContain('Are you sure version')
  }
})
test('request invalid version', async () => {
  for (const combination of [
    ['mandrel-23.1.1.0', '21'],
    ['mandrel-23.0.2.1', '17']
  ]) {
    let error = new Error('unexpected')
    try {
      await mandrel.setUpMandrel(combination[0], combination[1])
    } catch (err) {
      if (!(err instanceof Error)) {
        throw new Error(`Unexpected non-Error: ${err}`)
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Failed to download')
    expect(error.message).toContain('Are you sure version')
  }
})

test('find latest', async () => {
  // Make sure the action can find the latest Mandrel release
  const latestRelease = await getLatestRelease(mandrel.MANDREL_REPO)
  const tag_name = latestRelease.tag_name
  expect(tag_name).toContain(mandrel.MANDREL_TAG_PREFIX)
})

test('get known latest Mandrel for specific JDK', async () => {
  // Test deprecated versions that won't get updates anymore
  for (const combination of [
    ['11', '21.3.6.0-Final'],
    ['20', '23.0.1.2-Final']
  ]) {
    const latest = await mandrel.getLatestMandrelReleaseUrl(combination[0])
    expect(latest).toContain(`mandrel-java${combination[0]}`)
    expect(latest).toContain(combination[1])
  }
})

test('get latest Mandrel for specific JDK', async () => {
  // Test supported versions
  for (const javaVersion of ['17', '21']) {
    const latest = await mandrel.getLatestMandrelReleaseUrl(javaVersion)
    expect(latest).toContain(`mandrel-java${javaVersion}`)
  }
})

test('matchesMandrelAsset matches correct platform-specific asset names', () => {
  // Real asset names from mandrel-23.1.10.0-Final release
  const linuxAmd64 = 'mandrel-java21-linux-amd64-23.1.10.0-Final.tar.gz'
  const linuxAarch64 = 'mandrel-java21-linux-aarch64-23.1.10.0-Final.tar.gz'
  const macosAarch64 = 'mandrel-java21-macos-aarch64-23.1.10.0-Final.tar.gz'
  const windowsAmd64 = 'mandrel-java21-windows-amd64-23.1.10.0-Final.zip'

  // Linux x64
  expect(mandrel.matchesMandrelAsset(linuxAmd64, '21', 'linux', 'amd64', '.tar.gz')).toBe(true)
  expect(mandrel.matchesMandrelAsset(linuxAarch64, '21', 'linux', 'amd64', '.tar.gz')).toBe(false)

  // macOS uses 'macos', not 'darwin'
  expect(mandrel.matchesMandrelAsset(macosAarch64, '21', 'macos', 'aarch64', '.tar.gz')).toBe(true)
  expect(mandrel.matchesMandrelAsset(macosAarch64, '21', 'darwin', 'aarch64', '.tar.gz')).toBe(false)

  // Windows
  expect(mandrel.matchesMandrelAsset(windowsAmd64, '21', 'windows', 'amd64', '.zip')).toBe(true)

  // Wrong java version
  expect(mandrel.matchesMandrelAsset(linuxAmd64, '17', 'linux', 'amd64', '.tar.gz')).toBe(false)

  // Wrong extension
  expect(mandrel.matchesMandrelAsset(linuxAmd64, '21', 'linux', 'amd64', '.zip')).toBe(false)
})
