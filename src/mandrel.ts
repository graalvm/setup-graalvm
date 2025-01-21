import * as c from './constants'
import * as httpClient from '@actions/http-client'
import {downloadExtractAndCacheJDK} from './utils'
import {downloadTool} from '@actions/tool-cache'
import {basename} from 'path'

export const MANDREL_REPO = 'mandrel'
export const MANDREL_TAG_PREFIX = c.MANDREL_NAMESPACE
const MANDREL_DL_BASE = 'https://github.com/graalvm/mandrel/releases/download'
const DISCO_API_BASE = 'https://api.foojay.io/disco/v3.0/packages/jdks'

interface JdkData {
  message: string
  /* eslint-disable @typescript-eslint/no-explicit-any */
  result: any
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function setUpMandrel(
  mandrelVersion: string,
  javaVersion: string
): Promise<string> {
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
  return downloadExtractAndCacheJDK(
    async () => downloadTool(latest_release_url),
    toolName,
    version
  )
}

// Download URIs are of the form https://github.com/graalvm/mandrel/releases/download/<tag>/<archive-name>
function getTagFromURI(uri: string): string {
  const parts = uri.split('/')
  try {
    return parts[parts.length - 2]
  } catch (error) {
    throw new Error(`Failed to extract tag from URI ${uri}: ${error}`)
  }
}

export async function getLatestMandrelReleaseUrl(
  javaVersion: string
): Promise<string> {
  const url = `${DISCO_API_BASE}?jdk_version=${javaVersion}&distribution=${c.DISTRIBUTION_MANDREL}&architecture=${c.JDK_ARCH}&operating_system=${c.JDK_PLATFORM}&latest=per_distro`
  const _http = new httpClient.HttpClient()
  const response = await _http.getJson<JdkData>(url)
  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to fetch latest Mandrel release for Java ${javaVersion} from DISCO API: ${response.result}`
    )
  }
  const result = response.result?.result[0]
  try {
    const pkg_info_uri = result.links.pkg_info_uri
    return await getLatestMandrelReleaseUrlHelper(
      _http,
      javaVersion,
      pkg_info_uri
    )
  } catch (error) {
    throw new Error(
      `Failed to get latest Mandrel release for Java ${javaVersion} from DISCO API: ${error}`
    )
  }
}

async function getLatestMandrelReleaseUrlHelper(
  _http: httpClient.HttpClient,
  java_version: string,
  pkg_info_uri: string
): Promise<string> {
  const response = await _http.getJson<JdkData>(pkg_info_uri)
  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to fetch package info of latest Mandrel release for Java ${java_version} from DISCO API: ${response.result}`
    )
  }
  const result = response.result?.result[0]
  try {
    return result.direct_download_uri
  } catch (error) {
    throw new Error(
      `Failed to get download URI of latest Mandrel release for Java ${java_version} from DISCO API: ${error}`
    )
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

export function stripMandrelNamespace(graalVMVersion: string) {
  if (graalVMVersion.startsWith(c.MANDREL_NAMESPACE)) {
    return graalVMVersion.substring(
      c.MANDREL_NAMESPACE.length,
      graalVMVersion.length
    )
  } else {
    return graalVMVersion
  }
}
