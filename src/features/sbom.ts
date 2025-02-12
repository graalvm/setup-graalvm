import * as c from '../constants'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import { basename } from 'path'
import * as semver from 'semver'
import { setNativeImageOption } from '../utils'

const INPUT_NI_SBOM = 'native-image-enable-sbom'
const SBOM_FILE_SUFFIX = '.sbom.json'
const MIN_JAVA_VERSION = '24.0.0'

let javaVersionOrLatestEA: string | null = null

interface SBOM {
  components: Component[]
  dependencies: Dependency[]
}

interface Component {
  name: string
  version?: string
  purl?: string
  dependencies?: string[]
  'bom-ref': string
}

interface Dependency {
  ref: string
  dependsOn: string[]
}

interface DependencySnapshot {
  version: number
  sha: string
  ref: string
  job: {
    correlator: string
    id: string
    html_url?: string
  }
  detector: {
    name: string
    version: string
    url: string
  }
  scanned: string
  manifests: Record<
    string,
    {
      name: string
      metadata?: Record<string, string>
      // Not including the 'file' property because we cannot specify any reasonable value for 'source_location'
      // since the SBOM will not necessarily be saved in the repository of the user.
      // GitHub docs: https://docs.github.com/en/rest/dependency-graph/dependency-submission?apiVersion=2022-11-28#create-a-snapshot-of-dependencies-for-a-repository
      resolved: Record<
        string,
        {
          package_url: string
          relationship?: 'direct'
          scope?: 'runtime'
          dependencies?: string[]
        }
      >
    }
  >
}

export function setUpSBOMSupport(javaVersionOrDev: string, distribution: string): void {
  if (!isFeatureEnabled()) {
    return
  }

  validateJavaVersionAndDistribution(javaVersionOrDev, distribution)
  javaVersionOrLatestEA = javaVersionOrDev
  setNativeImageOption(javaVersionOrLatestEA, '--enable-sbom=export')
  core.info('Enabled SBOM generation for Native Image build')
}

function validateJavaVersionAndDistribution(javaVersionOrDev: string, distribution: string): void {
  if (distribution !== c.DISTRIBUTION_GRAALVM) {
    throw new Error(
      `The '${INPUT_NI_SBOM}' option is only supported for Oracle GraalVM (distribution '${c.DISTRIBUTION_GRAALVM}'), but found distribution '${distribution}'.`
    )
  }

  if (javaVersionOrDev === 'dev') {
    throw new Error(`The '${INPUT_NI_SBOM}' option is not supported for java-version 'dev'.`)
  }

  if (javaVersionOrDev === 'latest-ea') {
    return
  }

  const coercedJavaVersion = semver.coerce(javaVersionOrDev)
  if (!coercedJavaVersion || semver.gt(MIN_JAVA_VERSION, coercedJavaVersion)) {
    throw new Error(
      `The '${INPUT_NI_SBOM}' option is only supported for GraalVM for JDK ${MIN_JAVA_VERSION} or later, but found java-version '${javaVersionOrDev}'.`
    )
  }
}

export async function processSBOM(): Promise<void> {
  if (!isFeatureEnabled()) {
    return
  }

  if (javaVersionOrLatestEA === null) {
    throw new Error('setUpSBOMSupport must be called before processSBOM')
  }

  const sbomPath = await findSBOMFilePath()
  try {
    const sbomContent = fs.readFileSync(sbomPath, 'utf8')
    const sbomData = parseSBOM(sbomContent)
    const components = mapToComponentsWithDependencies(sbomData)
    printSBOMContent(components)
    const snapshot = convertSBOMToSnapshot(sbomPath, components)
    await submitDependencySnapshot(snapshot)
  } catch (error) {
    throw new Error(
      `Failed to process and submit SBOM to the GitHub dependency submission API: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function isFeatureEnabled(): boolean {
  return core.getInput(INPUT_NI_SBOM) === 'true'
}

async function findSBOMFilePath(): Promise<string> {
  const globber = await glob.create(`**/*${SBOM_FILE_SUFFIX}`)
  const sbomFiles = await globber.glob()

  if (sbomFiles.length === 0) {
    throw new Error('No SBOM found. Make sure native-image build completed successfully.')
  }

  if (sbomFiles.length > 1) {
    throw new Error(`Expected one SBOM but found multiple: ${sbomFiles.join(', ')}.`)
  }

  core.info(`Found SBOM: ${sbomFiles[0]}`)
  return sbomFiles[0]
}

function parseSBOM(jsonString: string): SBOM {
  try {
    const sbomData: SBOM = JSON.parse(jsonString)
    return sbomData
  } catch (error) {
    throw new Error(`Failed to parse SBOM JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Maps the SBOM to a list of components with their dependencies
function mapToComponentsWithDependencies(sbom: SBOM): Component[] {
  if (!sbom || sbom.components.length === 0) {
    throw new Error('Invalid SBOM data or no components found.')
  }

  return sbom.components.map((component: Component) => {
    const dependencies = sbom.dependencies?.find((dep: Dependency) => dep.ref === component['bom-ref'])?.dependsOn || []

    return {
      name: component.name,
      version: component.version,
      purl: component.purl,
      dependencies,
      'bom-ref': component['bom-ref']
    }
  })
}

function printSBOMContent(components: Component[]): void {
  core.info('=== SBOM Content ===')
  for (const component of components) {
    core.info(`- ${component['bom-ref']}`)
    if (component.dependencies && component.dependencies.length > 0) {
      core.info(`   depends on: ${component.dependencies.join(', ')}`)
    }
  }
  core.info('==================')
}

function convertSBOMToSnapshot(sbomPath: string, components: Component[]): DependencySnapshot {
  const context = github.context
  const sbomFileName = basename(sbomPath)

  if (!sbomFileName.endsWith(SBOM_FILE_SUFFIX)) {
    throw new Error(`Invalid SBOM file name: ${sbomFileName}. Expected a file ending with ${SBOM_FILE_SUFFIX}.`)
  }

  return {
    version: 0,
    sha: context.sha,
    ref: context.ref,
    job: {
      correlator: `${context.workflow}_${context.job}`,
      id: context.runId.toString(),
      html_url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
    },
    detector: {
      name: 'Oracle GraalVM',
      version: javaVersionOrLatestEA ?? '',
      url: 'https://www.graalvm.org/'
    },
    scanned: new Date().toISOString(),
    manifests: {
      [sbomFileName]: {
        name: sbomFileName,
        resolved: mapComponentsToGithubAPIFormat(components),
        metadata: {
          generated_by: 'SBOM generated by GraalVM Native Image',
          action_version: c.ACTION_VERSION
        }
      }
    }
  }
}

function mapComponentsToGithubAPIFormat(
  components: Component[]
): Record<string, { package_url: string; dependencies?: string[] }> {
  return Object.fromEntries(
    components
      .filter((component) => {
        if (!component.purl) {
          core.info(`Component ${component.name} does not have a valid package URL (purl). Skipping.`)
        }
        return component.purl
      })
      .map((component) => [
        component.name,
        {
          package_url: component.purl as string,
          dependencies: component.dependencies || []
        }
      ])
  )
}

async function submitDependencySnapshot(snapshotData: DependencySnapshot): Promise<void> {
  const token = core.getInput(c.INPUT_GITHUB_TOKEN, { required: true })
  const octokit = github.getOctokit(token)
  const context = github.context

  try {
    await octokit.request('POST /repos/{owner}/{repo}/dependency-graph/snapshots', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      version: snapshotData.version,
      sha: snapshotData.sha,
      ref: snapshotData.ref,
      job: snapshotData.job,
      detector: snapshotData.detector,
      metadata: {},
      scanned: snapshotData.scanned,
      manifests: snapshotData.manifests,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    core.info('Dependency snapshot submitted successfully.')
  } catch (error) {
    throw new Error(
      `Failed to submit dependency snapshot for SBOM: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
