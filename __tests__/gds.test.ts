import * as path from 'path'
import {downloadGraalVMEE, fetchArtifact} from '../src/gds'
import {expect, test} from '@jest/globals'

const TEST_USER_AGENT = 'GraalVMGitHubActionTest/1.0.4'

process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

test('fetch artifacts', async () => {
  let artifact = await fetchArtifact(
    TEST_USER_AGENT,
    'isBase:True',
    '21.3.0',
    '11'
  )
  expect(artifact.id).toBe('D540A9EA0F406A12E0530F15000A38C7')
  expect(artifact.checksum).toBe(
    '78e1ee14861eb6a58fd0d7f64878d544ad11515c237a6557452f4d3a63a070fc'
  )
  artifact = await fetchArtifact(TEST_USER_AGENT, 'isBase:True', '21.3.0', '17')
  expect(artifact.id).toBe('D540A9EA10C26A12E0530F15000A38C7')
  expect(artifact.checksum).toBe(
    '173e0e2b1f80033115216ebbad574c977e74fc4a37fa30ae5e6eff0f215070f4'
  )

  await expect(
    fetchArtifact(TEST_USER_AGENT, 'isBase:False', '21.3.0', '11')
  ).rejects.toThrow('Found more than one GDS artifact')
  await expect(
    fetchArtifact(TEST_USER_AGENT, 'isBase:True', '1.0.0', '11')
  ).rejects.toThrow('Unable to find JDK11-based GraalVM EE 1.0.0')
})

test('errors when downloading artifacts', async () => {
  await expect(downloadGraalVMEE('invalid', '21.3.0', '11')).rejects.toThrow(
    'The provided "gds-token" was rejected (reason: "Invalid download token", opc-request-id: /'
  )
  await expect(downloadGraalVMEE('invalid', '1.0.0', '11')).rejects.toThrow(
    'Unable to find JDK11-based GraalVM EE 1.0.0'
  )
  await expect(downloadGraalVMEE('invalid', '21.3.0', '1')).rejects.toThrow(
    'Unable to find JDK1-based GraalVM EE 21.3.0'
  )
})
