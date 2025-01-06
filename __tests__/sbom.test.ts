import * as c from '../src/constants'
import {setUpSBOMSupport, processSBOM} from '../src/features/sbom'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import {join} from 'path'
import {tmpdir} from 'os'
import {mkdtempSync, writeFileSync, rmSync} from 'fs'

jest.mock('@actions/glob')
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(() => ({
    request: jest.fn().mockResolvedValue(undefined)
  })),
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    sha: 'test-sha',
    ref: 'test-ref',
    workflow: 'test-workflow',
    job: 'test-job',
    runId: '12345'
  }
}))

function mockFindSBOM(files: string[]) {
  const mockCreate = jest.fn().mockResolvedValue({
    glob: jest.fn().mockResolvedValue(files)
  })
  ;(glob.create as jest.Mock).mockImplementation(mockCreate)
}

// Mocks the GitHub dependency submission API return value
// 'undefined' is treated as a successful request
function mockGithubAPIReturnValue(returnValue: Error | undefined = undefined) {
  const mockOctokit = {
    request:
      returnValue === undefined
        ? jest.fn().mockResolvedValue(returnValue)
        : jest.fn().mockRejectedValue(returnValue)
  }
  ;(github.getOctokit as jest.Mock).mockReturnValue(mockOctokit)
  return mockOctokit
}

describe('sbom feature', () => {
  let spyInfo: jest.SpyInstance<void, Parameters<typeof core.info>>
  let spyWarning: jest.SpyInstance<void, Parameters<typeof core.warning>>
  let spyExportVariable: jest.SpyInstance<
    void,
    Parameters<typeof core.exportVariable>
  >
  let workspace: string
  let originalEnv: NodeJS.ProcessEnv
  const javaVersion = '24.0.0'
  const distribution = c.DISTRIBUTION_GRAALVM

  beforeEach(() => {
    originalEnv = process.env

    process.env = {
      ...process.env,
      GITHUB_REPOSITORY: 'test-owner/test-repo',
      GITHUB_TOKEN: 'fake-token'
    }

    workspace = mkdtempSync(join(tmpdir(), 'setup-graalvm-sbom-'))
    mockGithubAPIReturnValue()

    spyInfo = jest.spyOn(core, 'info').mockImplementation(() => null)
    spyWarning = jest.spyOn(core, 'warning').mockImplementation(() => null)
    spyExportVariable = jest
      .spyOn(core, 'exportVariable')
      .mockImplementation(() => null)
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'native-image-enable-sbom') {
        return 'true'
      }
      if (name === 'github-token') {
        return 'fake-token'
      }
      return ''
    })
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
    spyInfo.mockRestore()
    spyWarning.mockRestore()
    spyExportVariable.mockRestore()
    rmSync(workspace, {recursive: true, force: true})
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
      const supported_versions = ['24', '24-ea', '24.0.2', 'latest-ea']
      for (const version of supported_versions) {
        expect(() => setUpSBOMSupport(version, distribution)).not.toThrow()
      }
    })

    it('should set the SBOM option when activated', () => {
      setUpSBOMSupport(javaVersion, distribution)

      expect(spyExportVariable).toHaveBeenCalledWith(
        c.NATIVE_IMAGE_OPTIONS_ENV,
        expect.stringContaining('--enable-sbom=export')
      )
      expect(spyInfo).toHaveBeenCalledWith(
        'Enabled SBOM generation for Native Image build'
      )
      expect(spyWarning).not.toHaveBeenCalled()
    })

    it('should not set the SBOM option when not activated', () => {
      jest.spyOn(core, 'getInput').mockReturnValue('false')
      setUpSBOMSupport(javaVersion, distribution)

      expect(spyExportVariable).not.toHaveBeenCalled()
      expect(spyInfo).not.toHaveBeenCalled()
      expect(spyWarning).not.toHaveBeenCalled()
    })
  })

  describe('process', () => {
    async function setUpAndProcessSBOM(sbom: object): Promise<void> {
      setUpSBOMSupport(javaVersion, distribution)
      spyInfo.mockClear()

      // Mock 'native-image' invocation by creating the SBOM file
      const sbomPath = join(workspace, 'test.sbom.json')
      writeFileSync(sbomPath, JSON.stringify(sbom, null, 2))

      mockFindSBOM([sbomPath])

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
          version: '20241224',
          purl: 'pkg:maven/org.json/json@20241224',
          'bom-ref': 'pkg:maven/org.json/json@20241224',
          properties: [
            {
              name: 'syft:cpe23',
              value: 'cpe:2.3:a:json:json:20241224:*:*:*:*:*:*:*'
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
          dependsOn: ['pkg:maven/org.json/json@20241224']
        },
        {
          ref: 'pkg:maven/org.json/json@20241224',
          dependsOn: []
        }
      ]
    }

    it('should process SBOM and display components', async () => {
      await setUpAndProcessSBOM(sampleSBOM)

      expect(spyInfo).toHaveBeenCalledWith(
        'Found SBOM: ' + join(workspace, 'test.sbom.json')
      )
      expect(spyInfo).toHaveBeenCalledWith('=== SBOM Content ===')
      expect(spyInfo).toHaveBeenCalledWith('- pkg:maven/org.json/json@20241224')
      expect(spyInfo).toHaveBeenCalledWith(
        '- pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT'
      )
      expect(spyInfo).toHaveBeenCalledWith(
        '   depends on: pkg:maven/org.json/json@20241224'
      )
      expect(spyWarning).not.toHaveBeenCalled()
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

      expect(spyInfo).toHaveBeenCalledWith('=== SBOM Content ===')
      expect(spyInfo).toHaveBeenCalledWith('- no-purl-package@1.0.0')
      expect(spyWarning).not.toHaveBeenCalled()
    })

    it('should handle missing SBOM file', async () => {
      setUpSBOMSupport(javaVersion, distribution)
      spyInfo.mockClear()

      mockFindSBOM([])

      await expect(processSBOM()).rejects.toBeInstanceOf(Error)
    })

    it('should throw when JSON contains an invalid SBOM', async () => {
      const invalidSBOM = {
        'out-of-spec-field': {}
      }
      try {
        await setUpAndProcessSBOM(invalidSBOM)
        fail('Expected an error since invalid JSON was passed')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should submit dependencies when processing valid SBOM', async () => {
      const mockOctokit = mockGithubAPIReturnValue(undefined)
      await setUpAndProcessSBOM(sampleSBOM)

      expect(mockOctokit.request).toHaveBeenCalledWith(
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
                  package_url: 'pkg:maven/org.json/json@20241224',
                  dependencies: []
                }),
                'main-test-app': expect.objectContaining({
                  package_url:
                    'pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT',
                  dependencies: ['pkg:maven/org.json/json@20241224']
                })
              })
            })
          })
        })
      )
      expect(spyInfo).toHaveBeenCalledWith(
        'Dependency snapshot submitted successfully.'
      )
    })

    it('should handle GitHub API submission errors gracefully', async () => {
      mockGithubAPIReturnValue(new Error('API submission failed'))

      await expect(setUpAndProcessSBOM(sampleSBOM)).rejects.toBeInstanceOf(
        Error
      )
    })
  })
})
