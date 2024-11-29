import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import * as glob from '@actions/glob'

export const INPUT_NI_SBOM = 'native-image-enable-sbom'
export const NATIVE_IMAGE_OPTIONS_ENV = 'NATIVE_IMAGE_OPTIONS'

export function setUpSBOMSupport(): void {
  const isSbomEnabled = core.getInput(INPUT_NI_SBOM) === 'true'
  if (!isSbomEnabled) {
    return
  }

  let options = process.env[NATIVE_IMAGE_OPTIONS_ENV] || ''
  if (options.length > 0) {
    options += ' '
  }
  options += '--enable-sbom=export'
  core.exportVariable(NATIVE_IMAGE_OPTIONS_ENV, options)
  core.info('Enabled SBOM generation for Native Image builds')
}

/**
 * Finds a single SBOM file in the build directory
 * @returns Path to the SBOM file or null if not found or multiple files exist
 */
async function findSBOMFile(): Promise<string | null> {
  const globber = await glob.create('**/*.sbom.json')
  const sbomFiles = await globber.glob()

  if (sbomFiles.length === 0) {
    core.warning('No SBOM file found. Make sure native-image build completed successfully.')
    return null
  }

  if (sbomFiles.length > 1) {
    core.warning(
      `Found multiple SBOM files: ${sbomFiles.join(', ')}. ` +
      'Expected exactly one SBOM file. Skipping SBOM processing.'
    )
    return null
  }

  core.info(`Found SBOM file: ${sbomFiles[0]}`)
  return sbomFiles[0]
}

function displaySBOMContent(sbomData: any): void {
  core.info('=== SBOM Content ===')
  
  if (sbomData.components) {
    core.info(`Found ${sbomData.components.length} components:`)
    for (const component of sbomData.components) {
      core.info(`- ${component.name}@${component.version || 'unknown'}`)
      if (component.dependencies?.length > 0) {
        core.info(`  Dependencies: ${component.dependencies.join(', ')}`)
      }
    }
  } else {
    core.info('No components found in SBOM')
  }
  
  core.info('==================')
}

export async function processSBOM(): Promise<void> {
  const isSbomEnabled = core.getInput(INPUT_NI_SBOM) === 'true'
  if (!isSbomEnabled) {
    return
  }

  const sbomFile = await findSBOMFile()
  if (!sbomFile) {
    return
  }
  
  try {
    const sbomContent = fs.readFileSync(sbomFile, 'utf8')
    const sbomData = JSON.parse(sbomContent)
    displaySBOMContent(sbomData)
  } catch (error) {
    core.warning(`Failed to process SBOM file: ${error instanceof Error ? error.message : String(error)}`)
  }
}

interface DependencySnapshot {
  version: number
  sha: string
  ref: string
  job: {
    correlator: string
    id: string
  }
  detector: {
    name: string
    version: string
    url: string
  }
  scanned: string
  manifests: Record<string, {
    name: string
    file: {
      source_location: string
    }
    resolved: Record<string, {
      package_url: string
      dependencies?: string[]
    }>
  }>
}

async function convertSBOMToSnapshot(sbomData: any): Promise<DependencySnapshot> {
  const context = github.context
  
  return {
    version: 0,
    sha: context.sha,
    ref: context.ref,
    job: {
      correlator: `${context.workflow}_${context.action}`,
      id: context.runId.toString()
    },
    detector: {
      name: 'graalvm-setup-sbom',
      version: '1.0.0',
      url: 'https://github.com/graalvm/setup-graalvm'
    },
    scanned: new Date().toISOString(),
    manifests: {
      'native-image-sbom.json': {
        name: 'native-image-sbom.json',
        file: {
          source_location: 'native-image-sbom.json'
        },
        resolved: convertSBOMDependencies(sbomData)
      }
    }
  }
}

function convertSBOMDependencies(sbomData: any): Record<string, {package_url: string, dependencies?: string[]}> {
  const resolved: Record<string, {package_url: string, dependencies?: string[]}> = {}
  
  if (sbomData.components) {
    for (const component of sbomData.components) {
      if (component.name && component.version) {
        resolved[component.name] = {
          package_url: `pkg:${component.type || 'maven'}/${component.name}@${component.version}`
        }
        
        if (component.dependencies?.length > 0) {
          resolved[component.name].dependencies = component.dependencies
        }
      }
    }
  }

  return resolved
}

async function submitDependencySnapshot(snapshot: DependencySnapshot): Promise<void> {
  const token = core.getInput('github-token')
  const octokit = github.getOctokit(token)
//   await octokit.rest.dependencyGraph.createSnapshot({
//     owner: github.context.repo.owner,
//     repo: github.context.repo.repo,
//     ...snapshot
//   })
}