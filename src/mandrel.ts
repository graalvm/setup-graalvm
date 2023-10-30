import * as c from './constants'
import {downloadExtractAndCacheJDK, getLatestRelease} from './utils'
import {downloadTool} from '@actions/tool-cache'
import {basename} from 'path'

export const MANDREL_REPO = 'mandrel'
export const MANDREL_TAG_PREFIX = c.MANDREL_NAMESPACE
const MANDREL_DL_BASE = 'https://github.com/graalvm/mandrel/releases/download'
const DISCO_API_BASE = 'https://api.foojay.io/disco/v3.0/packages/jdks'

export async function setUpMandrel(
  graalvmVersion: string,
  javaVersion: string
): Promise<string> {
  const mandrelVersion = graalvmVersion.substring(
    c.MANDREL_NAMESPACE.length,
    graalvmVersion.length
  )

  let mandrelHome
  switch (mandrelVersion) {
    case 'latest':
      mandrelHome = await setUpMandrelLatest(javaVersion)
      break
    default:
      mandrelHome = await setUpMandrelRelease(mandrelVersion, javaVersion)
      break
  }

  return mandrelHome
}

async function setUpMandrelLatest(javaVersion: string): Promise<string> {
  const latest_release_url = await getLatestMandrelReleaseUrl(javaVersion)
  const version_tag = getTagFromURI(latest_release_url);
  const version = version_tag.substring(c.MANDREL_NAMESPACE.length, version_tag.length)
  console.log(version);
    
  const toolName = determineToolName(javaVersion)
  return downloadExtractAndCacheJDK(
    async () => downloadTool(latest_release_url),
    toolName,
    version
  )
}

// Download URIs are of the form https://github.com/graalvm/mandrel/releases/download/<tag>/<archive-name>
function getTagFromURI(uri: string): string {
  const parts = uri.split('/');
  try {
    return parts[parts.length - 2];
  } catch (error) {
    throw new Error(`Failed to extract tag from URI ${uri}: ${error}`)
  }
}

export async function getLatestMandrelReleaseUrl(javaVersion: string): Promise<string> {
  const url = `${DISCO_API_BASE}?jdk_version=${javaVersion}&distribution=${c.DISTRIBUTION_MANDREL}&architecture=${c.JDK_ARCH}&operating_system=${c.JDK_PLATFORM}&latest=per_distro`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch latest Mandrel release for Java ${javaVersion} from DISCO API: ${response.statusText}`)
  }
  const data = await response.json()
  try {
    const pkg_info_uri = data.result[0].links.pkg_info_uri
    return getLatestMandrelReleaseUrlHelper(javaVersion, pkg_info_uri)
  } catch (error) {
    throw new Error(`Failed to get latest Mandrel release for Java ${javaVersion} from DISCO API: ${error}`)
  }
}

async function getLatestMandrelReleaseUrlHelper(java_version: string, pkg_info_uri: string): Promise<string> {
  const response = await fetch(pkg_info_uri)
  if (!response.ok) {
    throw new Error(`Failed to fetch package info of latest Mandrel release for Java ${java_version} from DISCO API: ${response.statusText}`)
  }
  const data = await response.json()
  try {
    return data.result[0].direct_download_uri
  } catch (error) {
    throw new Error(`Failed to get download URI of latest Mandrel release for Java ${java_version} from DISCO API: ${error}`)
  }
}

async function setUpMandrelRelease(
  version: string,
  javaVersion: string
): Promise<string> {
  const toolName = determineToolName(javaVersion)
  return downloadExtractAndCacheJDK(
    async () => downloadMandrelJDK(version, javaVersion),
    toolName,
    version
  )
}

async function downloadMandrelJDK(
  version: string,
  javaVersion: string
): Promise<string> {
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
        )}. Are you sure version: '${version}' and java-version: '${javaVersion}' are correct?`
      )
    }
    throw new Error(
      `Failed to download ${basename(downloadUrl)} (error: ${error}).`
    )
  }
}

function determineMandrelIdentifier(
  version: string,
  javaVersion: string
): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}-${c.GRAALVM_ARCH}-${version}`
}

function determineToolName(javaVersion: string): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}`
}
