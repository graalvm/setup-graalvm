import * as path from 'path'
import * as mandrel from '../src/mandrel'
import {expect, test} from '@jest/globals'
import {getLatestRelease} from '../src/utils'

process.env['RUNNER_TOOL_CACHE'] = path.join(__dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('request invalid version/javaVersion combination', async () => {
  for (var combination of [
    ['mandrel-23.1.1.0-Final', '17'],
    ['mandrel-23.0.2.1-Final', '21']
  ]) {
    let error = new Error('unexpected')
    try {
      await mandrel.setUpMandrel(combination[0], combination[1])
    } catch (err) {
      if (!(err instanceof Error)) {
        fail(`Unexpected non-Error: ${err}`)
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Failed to download')
    expect(error.message).toContain('Are you sure version')
  }
})
test('request invalid version', async () => {
  for (var combination of [
    ['mandrel-23.1.1.0', '21'],
    ['mandrel-23.0.2.1', '17']
  ]) {
    let error = new Error('unexpected')
    try {
      await mandrel.setUpMandrel(combination[0], combination[1])
    } catch (err) {
      if (!(err instanceof Error)) {
        fail(`Unexpected non-Error: ${err}`)
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
  for (var combination of [
    ['11', '22.2.0.0-Final'],
    ['20', '23.0.1.2-Final']
  ]) {
    const latest = await mandrel.getLatestMandrelReleaseUrl(combination[0])
    expect(latest).toContain(`mandrel-java${combination[0]}`)
    expect(latest).toContain(combination[1])
  }
})

test('get latest Mandrel for specific JDK', async () => {
  // Test supported versions
  for (var javaVersion of ['17', '21']) {
    const latest = await mandrel.getLatestMandrelReleaseUrl(javaVersion)
    expect(latest).toContain(`mandrel-java${javaVersion}`)
  }
})

