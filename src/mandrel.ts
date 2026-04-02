import * as c from './constants.js'
import { downloadExtractAndCacheJDK, findLatestReleaseWithAsset } from './utils.js'
import { downloadTool } from '@actions/tool-cache'
import { basename } from 'path'

export const MANDREL_REPO = 'mandrel'
export const MANDREL_TAG_PREFIX = c.MANDREL_NAMESPACE
const MANDREL_DL_BASE = 'https://github.com/graalvm/mandrel/releases/download'

export async function setUpMandrel(mandrelVersion: string, javaVersion: string): Promise<string> {
  const version = stripMandrelNamespace(mandrelVersion)
  let mandrelHome
  switch (version) {
    case '':
      // fetch latest if no version is specified
      mandrelHome = await setUpMandrelLatest(javaVersion)
      break
    case 'latest':
      mandrelHome = await setUpMandrelLatest(javaVersion)
      break
    default:
      mandrelHome = await setUpMandrelRelease(version, javaVersion)
      break
  }

  return mandrelHome
}

async function setUpMandrelLatest(javaVersion: string): Promise<string> {
  const latest_release_url = await getLatestMandrelReleaseUrl(javaVersion)
  const version_tag = getTagFromURI(latest_release_url)
  const version = stripMandrelNamespace(version_tag)

  const toolName = determineToolName(javaVersion)
  return downloadExtractAndCacheJDK(async () => downloadTool(latest_release_url), toolName, version)
}

// Download URIs are of the form https://github.com/graalvm/mandrel/releases/download/<tag>/<archive-name>
function getTagFromURI(uri: string): string {
  const parts = uri.split('/')
  try {
    return parts[parts.length - 2]
  } catch (error) {
    throw new Error(`Failed to extract tag from URI ${uri}`, { cause: error })
  }
}

export function matchesMandrelAsset(
  name: string,
  javaVersion: string,
  platform: string,
  arch: string,
  extension: string
): boolean {
  const expectedPrefix = `mandrel-java${javaVersion}-${platform}-${arch}-`
  return name.startsWith(expectedPrefix) && name.endsWith(extension)
}

export async function getLatestMandrelReleaseUrl(javaVersion: string): Promise<string> {
  try {
    return await findLatestReleaseWithAsset(MANDREL_REPO, (name) =>
      matchesMandrelAsset(name, javaVersion, c.JDK_PLATFORM, c.GRAALVM_ARCH, c.GRAALVM_FILE_EXTENSION)
    )
  } catch (error) {
    throw new Error(
      `Failed to find latest Mandrel release for Java ${javaVersion}. Are you sure java-version: '${javaVersion}' is correct?`,
      { cause: error }
    )
  }
}

async function setUpMandrelRelease(version: string, javaVersion: string): Promise<string> {
  const toolName = determineToolName(javaVersion)
  return downloadExtractAndCacheJDK(async () => downloadMandrelJDK(version, javaVersion), toolName, version)
}

async function downloadMandrelJDK(version: string, javaVersion: string): Promise<string> {
  const identifier = determineMandrelIdentifier(version, javaVersion)
  const downloadUrl = `${MANDREL_DL_BASE}/${MANDREL_TAG_PREFIX}${version}/${identifier}${c.GRAALVM_FILE_EXTENSION}`
  try {
    return await downloadTool(downloadUrl)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      // Not Found
      throw new Error(
        `Failed to download ${basename(
          downloadUrl
        )}. Are you sure version: '${version}' and java-version: '${javaVersion}' are correct?`,
        { cause: error }
      )
    }
    throw new Error(`Failed to download ${basename(downloadUrl)}.`, { cause: error })
  }
}

function determineMandrelIdentifier(version: string, javaVersion: string): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}-${c.GRAALVM_ARCH}-${version}`
}

function determineToolName(javaVersion: string): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}`
}

export function stripMandrelNamespace(graalVMVersion: string) {
  if (graalVMVersion.startsWith(c.MANDREL_NAMESPACE)) {
    return graalVMVersion.substring(c.MANDREL_NAMESPACE.length, graalVMVersion.length)
  } else {
    return graalVMVersion
  }
}
