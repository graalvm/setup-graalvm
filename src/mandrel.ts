import * as c from './constants'
import {downloadExtractAndCacheJDK, getLatestRelease} from './utils'

const MANDREL_REPO = 'mandrel'
const MANDREL_TAG_PREFIX = c.MANDREL_NAMESPACE
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
  const identifier = determineMandrelIdentifier(version, javaVersion)
  const downloadUrl = `${MANDREL_DL_BASE}/${MANDREL_TAG_PREFIX}${version}/${identifier}${c.GRAALVM_FILE_EXTENSION}`
  const toolName = determineToolName(javaVersion)
  return downloadExtractAndCacheJDK(downloadUrl, toolName, version)
}

function determineMandrelIdentifier(
  version: string,
  javaVersion: string
): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}-amd64-${version}`
}

function determineToolName(javaVersion: string): string {
  return `mandrel-java${javaVersion}-${c.GRAALVM_PLATFORM}`
}
