import * as path from 'path'
import { downloadGraalVM, downloadGraalVMEELegacy, fetchArtifact, fetchArtifactEE } from '../src/gds'
import { expect, test } from '@jest/globals'

const TEST_USER_AGENT = 'GraalVMGitHubActionTest/1.0.4'

process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('fetch artifacts', async () => {
  let artifact = await fetchArtifact(TEST_USER_AGENT, 'isBase:True', '17.0.12')
  expect(artifact.id).toBe('1C351E8F41BB8E9EE0631518000AE5F2')
  expect(artifact.checksum).toBe('b6f3dace24cf1960ec790216f4c86f00d4f43df64e4e8b548f6382f04894713f')
  artifact = await fetchArtifact(TEST_USER_AGENT, 'isBase:True', '17')
  expect(artifact.checksum).toHaveLength('b6f3dace24cf1960ec790216f4c86f00d4f43df64e4e8b548f6382f04894713f'.length)
})

test('errors when downloading artifacts', async () => {
  await expect(downloadGraalVM('invalid', '17')).rejects.toThrow(
    'The provided "gds-token" was rejected (reason: "Invalid download token", opc-request-id: '
  )
  await expect(downloadGraalVM('invalid', '1')).rejects.toThrow('Unable to find GraalVM for JDK 1')
})

test('fetch legacy artifacts', async () => {
  let artifact = await fetchArtifactEE(TEST_USER_AGENT, 'isBase:True', '22.1.0', '11')
  expect(artifact.id).toBe('DCECD1C1B0B5B8DBE0536E16000A5C74')
  expect(artifact.checksum).toBe('4280782f6c7fcabe0ba707e8389cbfaf7bbe6b0cf634d309e6efcd1b172e3ce6')
  artifact = await fetchArtifactEE(TEST_USER_AGENT, 'isBase:True', '22.1.0', '17')
  expect(artifact.id).toBe('DCECD2068882A0E9E0536E16000A9504')
  expect(artifact.checksum).toBe('e897add7d94bc456a61e6f927e831dff759efa3392a4b69c720dd3debc8f947d')

  await expect(fetchArtifactEE(TEST_USER_AGENT, 'isBase:False', '22.1.0', '11')).rejects.toThrow(
    'Found more than one GDS artifact'
  )
  await expect(fetchArtifactEE(TEST_USER_AGENT, 'isBase:True', '1.0.0', '11')).rejects.toThrow(
    'Unable to find JDK11-based GraalVM EE 1.0.0'
  )
})

test('errors when downloading legacy artifacts', async () => {
  await expect(downloadGraalVMEELegacy('invalid', '22.1.0', '11')).rejects.toThrow(
    'The provided "gds-token" was rejected (reason: "Invalid download token", opc-request-id: '
  )
  await expect(downloadGraalVMEELegacy('invalid', '1.0.0', '11')).rejects.toThrow(
    'Unable to find JDK11-based GraalVM EE 1.0.0'
  )
  await expect(downloadGraalVMEELegacy('invalid', '22.1.0', '1')).rejects.toThrow(
    'Unable to find JDK1-based GraalVM EE 22.1.0'
  )
})
