import * as c from './constants'
import {downloadExtractAndCacheJDK, getLatestRelease} from './utils'
import {downloadTool} from '@actions/tool-cache'
import {basename} from 'path'

export const MANDREL_REPO = 'mandrel'
export const MANDREL_TAG_PREFIX = c.MANDREL_NAMESPACE
const MANDREL_DL_BASE = 'https://github.com/graalvm/mandrel/releases/download'

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
  const latestRelease = await getLatestRelease(MANDREL_REPO)
  const tag_name = latestRelease.tag_name
  if (tag_name.startsWith(MANDREL_TAG_PREFIX)) {
    const latestVersion = tag_name.substring(
      MANDREL_TAG_PREFIX.length,
      tag_name.length
    )
    return setUpMandrelRelease(latestVersion, javaVersion)
  }
  throw new Error(`Could not find latest Mandrel release: ${tag_name}`)
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
