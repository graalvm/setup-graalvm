import {setUpSBOMSupport, processSBOM, INPUT_NI_SBOM, NATIVE_IMAGE_OPTIONS_ENV} from '../src/features/sbom'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import {join} from 'path'
import {tmpdir} from 'os'
import {mkdtempSync, writeFileSync, rmSync} from 'fs'

// Module level mock
jest.mock('@actions/glob')

describe('sbom feature', () => {
  let spyInfo: jest.SpyInstance<void, Parameters<typeof core.info>>
  let spyWarning: jest.SpyInstance<void, Parameters<typeof core.warning>>
  let spyExportVariable: jest.SpyInstance<void, Parameters<typeof core.exportVariable>>
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'setup-graalvm-sbom-'))
    
    spyInfo = jest.spyOn(core, 'info').mockImplementation(() => null)
    spyWarning = jest.spyOn(core, 'warning').mockImplementation(() => null)
    spyExportVariable = jest.spyOn(core, 'exportVariable').mockImplementation(() => null)
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === INPUT_NI_SBOM) {
        return 'true'
      }
      return ''
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
    rmSync(workspace, {recursive: true, force: true})
  })

  describe('setup', () => {
    it('should set the SBOM option flag when activated', () => {
      setUpSBOMSupport()
      expect(spyExportVariable).toHaveBeenCalledWith(
        NATIVE_IMAGE_OPTIONS_ENV,
        expect.stringContaining('--enable-sbom=export')
      )
      expect(spyInfo).toHaveBeenCalledWith('Enabled SBOM generation for Native Image builds')
    })

    it('should not set the SBOM option flag when not activated', () => {
      jest.spyOn(core, 'getInput').mockReturnValue('false')
      setUpSBOMSupport()
      expect(spyExportVariable).not.toHaveBeenCalled()
      expect(spyInfo).not.toHaveBeenCalled()
    })
  })

  describe('process', () => {
    const sampleSBOM = {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      serialNumber: "urn:uuid:52c977f8-6d04-3c07-8826-597a036d61a6",
      components: [
        {
          type: "library",
          group: "org.json",
          name: "json",
          version: "20211205",
          purl: "pkg:maven/org.json/json@20211205",
          "bom-ref": "pkg:maven/org.json/json@20211205",
          properties: [
            {
              name: "syft:cpe23",
              value: "cpe:2.3:a:json:json:20211205:*:*:*:*:*:*:*"
            }
          ]
        },
        {
          type: "library",
          group: "com.oracle",
          name: "main-test-app",
          version: "1.0-SNAPSHOT",
          purl: "pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT",
          "bom-ref": "pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT"
        }
      ],
      dependencies: [
        {
          ref: "pkg:maven/com.oracle/main-test-app@1.0-SNAPSHOT",
          dependsOn: ["pkg:maven/org.json/json@20211205"]
        },
        {
          ref: "pkg:maven/org.json/json@20211205",
          dependsOn: []
        }
      ]
    }

    it('should process SBOM file and display components', async () => {    
      setUpSBOMSupport()
      spyInfo.mockClear()

      // Mock 'native-image' invocation by creating the SBOM file
      const sbomPath = join(workspace, 'test.sbom.json')
      writeFileSync(sbomPath, JSON.stringify(sampleSBOM, null, 2))
      
      const mockCreate = jest.fn().mockResolvedValue({
        glob: jest.fn().mockResolvedValue([sbomPath])
      })
      ;(glob.create as jest.Mock).mockImplementation(mockCreate)

      await processSBOM()

      expect(spyInfo).toHaveBeenCalledWith('Found SBOM file: ' + sbomPath)
      expect(spyInfo).toHaveBeenCalledWith('=== SBOM Content ===')
      expect(spyInfo).toHaveBeenCalledWith('Found 2 dependencies:')
      expect(spyInfo).toHaveBeenCalledWith('- json@20211205')
      expect(spyInfo).toHaveBeenCalledWith('- main-test-app@1.0-SNAPSHOT')
      expect(spyWarning).not.toHaveBeenCalled()
    })

    it('should handle missing SBOM file', async () => {
      setUpSBOMSupport()
      spyInfo.mockClear()

      // Mock glob to return empty array (no files found)
      const mockCreate = jest.fn().mockResolvedValue({
        glob: jest.fn().mockResolvedValue([])
      })
      ;(glob.create as jest.Mock).mockImplementation(mockCreate)

      await processSBOM()
      expect(spyWarning).toHaveBeenCalledWith(
        'No SBOM file found. Make sure native-image build completed successfully.'
      )
    })
  })
})