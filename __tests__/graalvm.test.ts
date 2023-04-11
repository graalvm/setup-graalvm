import * as path from 'path'
import * as graalvm from '../src/graalvm'
import {expect, test} from '@jest/globals'
import {getLatestRelease} from '../src/utils'
import {findGraalVMVersion, findHighestJavaVersion} from '../src/graalvm'
import {GRAALVM_RELEASES_REPO} from '../src/constants'

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
      if (!(err instanceof Error)) {
        fail(`Unexpected non-Erro: ${err}`)
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Failed to download')
    expect(error.message).toContain('Are you sure version')
  }
})

test('find version/javaVersion', async () => {
  const latestRelease = await getLatestRelease(GRAALVM_RELEASES_REPO)
  const latestVersion = findGraalVMVersion(latestRelease)
  expect(latestVersion).not.toBe('')
  const latestJavaVersion = findHighestJavaVersion(latestRelease, latestVersion)
  expect(latestJavaVersion).not.toBe('')

  let error = new Error('unexpected')
  try {
    const invalidRelease = {...latestRelease, tag_name: 'invalid'}
    findGraalVMVersion(invalidRelease)
  } catch (err) {
    if (!(err instanceof Error)) {
      fail(`Unexpected non-Erro: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Could not find latest GraalVM release:')

  try {
    findHighestJavaVersion(latestRelease, 'invalid')
  } catch (err) {
    if (!(err instanceof Error)) {
      fail(`Unexpected non-Erro: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Could not find highest Java version.')
})
