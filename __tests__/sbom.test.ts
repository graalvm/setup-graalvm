/* eslint-disable @typescript-eslint/no-explicit-any */

import * as c from '../src/constants'
import { join } from 'path'
import { tmpdir } from 'os'
import { expect, jest } from '@jest/globals'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import * as core from '../__fixtures__/core.js'
import * as glob from '../__fixtures__/glob.js'
import * as github from '../__fixtures__/github.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/glob', () => glob)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { setUpSBOMSupport, processSBOM } = await import('../src/features/sbom.js')

function mockFindSBOM(files: string[]) {
  glob.create.mockImplementation(
    jest.fn<() => Promise<any>>().mockResolvedValue({
      glob: jest.fn<() => Promise<string[]>>().mockResolvedValue(files)
    })
  )
}

const request = jest.fn<any>().mockResolvedValue(undefined)

describe('sbom feature', () => {
  let workspace: string
  let originalEnv: NodeJS.ProcessEnv
  const javaVersion = '25.0.0'
  const distribution = c.DISTRIBUTION_GRAALVM

  beforeEach(() => {
    originalEnv = process.env

    process.env = {
      ...process.env,
      GITHUB_REPOSITORY: 'test-owner/test-repo',
      GITHUB_TOKEN: 'fake-token'
    }

    workspace = mkdtempSync(join(tmpdir(), 'setup-graalvm-sbom-'))

    core.info.mockImplementation(() => null)
    core.warning.mockImplementation(() => null)
    core.debug.mockImplementation(() => null)
    core.getInput.mockImplementation((name: string) => {
      if (name === 'native-image-enable-sbom') {
        return 'true'
      }
      if (name === 'github-token') {
        return 'fake-token'
      }
      return ''
    })

    github.getOctokit.mockImplementation(
      jest.fn<any>(() => ({
        request: request
      }))
    )
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
    rmSync(workspace, { recursive: true, force: true })
  })

  describe('setup', () => {
    it('should throw an error when the distribution is not Oracle GraalVM', () => {
      const not_supported_distributions = [
        c.DISTRIBUTION_GRAALVM_COMMUNITY,
        c.DISTRIBUTION_MANDREL,
        c.DISTRIBUTION_LIBERICA,
        ''
      ]
      for (const distribution of not_supported_distributions) {
        expect(() => setUpSBOMSupport(javaVersion, distribution)).toThrow()
      }
    })

    it('should throw an error when the java-version is not supported', () => {
      const not_supported_versions = ['23', '23-ea', '21.0.3', 'dev', '17', '']
      for (const version of not_supported_versions) {
        expect(() => setUpSBOMSupport(version, distribution)).toThrow()
      }
    })

    it('should not throw an error when the java-version is supported', () => {
      const supported_versions = ['25', '26-ea', 'latest-ea']
      for (const version of supported_versions) {
        expect(() => setUpSBOMSupport(version, distribution)).not.toThrow()
      }
    })

    it('should set the SBOM option when activated', () => {
      setUpSBOMSupport(javaVersion, distribution)

      expect(core.exportVariable).toHaveBeenCalledWith(
        c.NATIVE_IMAGE_OPTIONS_ENV,
        expect.stringContaining('--enable-sbom=export')
      )
      expect(core.info).toHaveBeenCalledWith('Enabled SBOM generation for Native Image build')
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('should not set the SBOM option when not activated', () => {
      core.getInput.mockReturnValue('false')
      setUpSBOMSupport(javaVersion, distribution)

      expect(core.exportVariable).not.toHaveBeenCalled()
      expect(core.info).not.toHaveBeenCalled()
      expect(core.warning).not.toHaveBeenCalled()
    })
  })

  describe('process', () => {
    async function setUpAndProcessSBOM(sbom: object): Promise<void> {
      setUpSBOMSupport(javaVersion, distribution)
      core.info.mockClear()

      // Mock 'native-image' invocation by creating the SBOM file
      const sbomPath = join(workspace, 'test.sbom.json')
      writeFileSync(sbomPath, JSON.stringify(sbom, null, 2))

      mockFindSBOM([sbomPath])
      core.getState.mockReturnValue(javaVersion)

      await processSBOM()
    }

    const sampleSBOM = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      serialNumber: 'urn:uuid:52c977f8-6d04-3c07-8826-597a036d61a6',
      components: [
        {
          type: 'library',
          group: 'org.json',
          name: 'json',
          version: '20250517',
          purl: 'pkg:maven/org.json/json@20250517',
          'bom-ref': 'pkg:maven/org.json/json@20250517',
          properties: [
            {
              name: 'syft:cpe23',
              value: 'cpe:2.3:a:json:json:20250517:*:*:*:*:*:*:*'
            }
          ]
        },
        {
          type: 'library',
          group: 'com.oracle',
          name: 'main-test-app',
          version: '1.0-SNAPSHOT',
          purl: 'pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT',
          'bom-ref': 'pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT'
        }
      ],
      dependencies: [
        {
          ref: 'pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT',
          dependsOn: ['pkg:maven/org.json/json@20250517']
        },
        {
          ref: 'pkg:maven/org.json/json@20250517',
          dependsOn: []
        }
      ]
    }

    it('should throw an error if setUpSBOMSupport was not called before processSBOM', async () => {
      await expect(processSBOM()).rejects.toThrow('setUpSBOMSupport must be called before processSBOM')
    })

    it('should process SBOM and display components', async () => {
      await setUpAndProcessSBOM(sampleSBOM)

      expect(core.info).toHaveBeenCalledWith('Found SBOM: ' + join(workspace, 'test.sbom.json'))
      expect(core.info).toHaveBeenCalledWith('=== SBOM Content ===')
      expect(core.info).toHaveBeenCalledWith('- pkg:maven/org.json/json@20250517')
      expect(core.info).toHaveBeenCalledWith('- pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT')
      expect(core.info).toHaveBeenCalledWith('   depends on: pkg:maven/org.json/json@20250517')
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('should handle components without purl', async () => {
      const sbomWithoutPurl = {
        ...sampleSBOM,
        components: [
          {
            type: 'library',
            name: 'no-purl-package',
            version: '1.0.0',
            'bom-ref': 'no-purl-package@1.0.0'
          }
        ]
      }
      await setUpAndProcessSBOM(sbomWithoutPurl)

      expect(core.info).toHaveBeenCalledWith('=== SBOM Content ===')
      expect(core.info).toHaveBeenCalledWith('- no-purl-package@1.0.0')
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('should handle missing SBOM file', async () => {
      setUpSBOMSupport(javaVersion, distribution)
      core.info.mockClear()

      mockFindSBOM([])

      await expect(processSBOM()).rejects.toBeInstanceOf(Error)
    })

    it('should throw when JSON contains an invalid SBOM', async () => {
      const invalidSBOM = {
        'out-of-spec-field': {}
      }
      let error
      try {
        await setUpAndProcessSBOM(invalidSBOM)
        throw new Error('Expected an error since invalid JSON was passed')
      } catch (e) {
        error = e
      } finally {
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should submit dependencies when processing valid SBOM', async () => {
      await setUpAndProcessSBOM(sampleSBOM)

      expect(request).toHaveBeenCalledWith(
        'POST /repos/{owner}/{repo}/dependency-graph/snapshots',
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          version: expect.any(Number),
          sha: 'test-sha',
          ref: 'test-ref',
          job: expect.objectContaining({
            correlator: 'test-workflow_test-job',
            id: '12345'
          }),
          manifests: expect.objectContaining({
            'test.sbom.json': expect.objectContaining({
              name: 'test.sbom.json',
              resolved: expect.objectContaining({
                json: expect.objectContaining({
                  package_url: 'pkg:maven/org.json/json@20250517',
                  dependencies: []
                }),
                'main-test-app': expect.objectContaining({
                  package_url: 'pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT',
                  dependencies: ['pkg:maven/org.json/json@20250517']
                })
              })
            })
          })
        })
      )
      expect(core.info).toHaveBeenCalledWith('Dependency snapshot submitted successfully.')
    })

    it('should handle GitHub API submission errors gracefully', async () => {
      github.getOctokit.mockImplementation(
        jest.fn<any>(() => ({
          request: jest.fn<(a: any, b: any) => Promise<any>>().mockRejectedValue(new Error('API submission failed'))
        }))
      )

      await expect(setUpAndProcessSBOM(sampleSBOM)).rejects.toBeInstanceOf(Error)
    })
  })
})
