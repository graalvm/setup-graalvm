import * as path from 'path'
import * as graalvm from '../src/graalvm'
import { expect, test } from '@jest/globals'
import { getTaggedRelease } from '../src/utils'
import { findGraalVMVersion, findHighestJavaVersion, findLatestEABuildDownloadUrl } from '../src/graalvm'
import { GRAALVM_GH_USER, GRAALVM_RELEASES_REPO } from '../src/constants'

process.env['RUNNER_TOOL_CACHE'] = path.join(__dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('request invalid version/javaVersion', async () => {
  for (const combination of [
    ['22.3.0', '7'],
    ['22.3', '17'],
    ['22.3', '7']
  ]) {
    let error = new Error('unexpected')
    try {
      await graalvm.setUpGraalVMRelease('', combination[0], combination[1])
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

test('find version/javaVersion', async () => {
  // Make sure the action can find the latest Java version for known major versions
  for (const majorJavaVersion of ['17', '20']) {
    await graalvm.findLatestGraalVMJDKCEJavaVersion(majorJavaVersion)
  }

  let error = new Error('unexpected')
  try {
    await graalvm.findLatestGraalVMJDKCEJavaVersion('11')
    throw new Error('Should not find Java version for 11')
  } catch (err) {
    if (!(err instanceof Error)) {
      throw new Error(`Unexpected non-Error: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Unable to find the latest Java version for')

  const latestRelease = await getTaggedRelease(GRAALVM_GH_USER, GRAALVM_RELEASES_REPO, 'vm-22.3.1')
  const latestVersion = findGraalVMVersion(latestRelease)
  expect(latestVersion).not.toBe('')
  const latestJavaVersion = findHighestJavaVersion(latestRelease, latestVersion)
  expect(latestJavaVersion).not.toBe('')

  error = new Error('unexpected')
  try {
    const invalidRelease = { ...latestRelease, tag_name: 'invalid' }
    findGraalVMVersion(invalidRelease)
  } catch (err) {
    if (!(err instanceof Error)) {
      throw new Error(`Unexpected non-Error: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Could not find latest GraalVM release:')

  try {
    findHighestJavaVersion(latestRelease, 'invalid')
  } catch (err) {
    if (!(err instanceof Error)) {
      throw new Error(`Unexpected non-Error: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Could not find highest Java version.')
})

test('find EA version/javaVersion', async () => {
  const url22EA = await findLatestEABuildDownloadUrl('22-ea')
  expect(url22EA).not.toBe('')
  const urlLatestEA = await findLatestEABuildDownloadUrl('latest-ea')
  expect(urlLatestEA).not.toBe('')

  let error = new Error('unexpected')
  try {
    await findLatestEABuildDownloadUrl('8-ea')
  } catch (err) {
    if (!(err instanceof Error)) {
      throw new Error(`Unexpected non-Error: ${err}`)
    }
    error = err
  }
  expect(error.message).toContain('Unable to resolve download URL for')
})
