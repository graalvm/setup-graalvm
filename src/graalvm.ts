import * as c from './constants'
import {
  downloadAndExtractJDK,
  downloadExtractAndCacheJDK,
  getLatestRelease
} from './utils'
import {downloadGraalVMEE} from './gds'
import {downloadTool} from '@actions/tool-cache'

const GRAALVM_CE_DL_BASE = `https://github.com/graalvm/${c.GRAALVM_RELEASES_REPO}/releases/download`
const GRAALVM_REPO_DEV_BUILDS = 'graalvm-ce-dev-builds'
const GRAALVM_TAG_PREFIX = 'vm-'

export async function setUpGraalVMLatest(
  gdsToken: string,
  javaVersion: string
): Promise<string> {
  if (gdsToken.length > 0) {
    return setUpGraalVMRelease(gdsToken, c.VERSION_LATEST, javaVersion)
  }
  const latestRelease = await getLatestRelease(c.GRAALVM_RELEASES_REPO)
  const version = findGraalVMVersion(latestRelease)
  return setUpGraalVMRelease(gdsToken, version, javaVersion)
}

export function findGraalVMVersion(release: c.LatestReleaseResponse['data']) {
  const tag_name = release.tag_name
  if (!tag_name.startsWith(GRAALVM_TAG_PREFIX)) {
    throw new Error(`Could not find latest GraalVM release: ${tag_name}`)
  }
  return tag_name.substring(GRAALVM_TAG_PREFIX.length, tag_name.length)
}

export async function setUpGraalVMDevBuild(
  gdsToken: string,
  javaVersion: string
): Promise<string> {
  if (gdsToken.length > 0) {
    throw new Error('Downloading GraalVM EE dev builds is not supported')
  }
  const latestDevBuild = await getLatestRelease(GRAALVM_REPO_DEV_BUILDS)
  let resolvedJavaVersion
  if (javaVersion == c.VERSION_DEV) {
    resolvedJavaVersion = findHighestJavaVersion(latestDevBuild, c.VERSION_DEV)
  } else {
    resolvedJavaVersion = javaVersion
  }
  const downloadUrl = findDownloadUrl(latestDevBuild, resolvedJavaVersion)
  return downloadAndExtractJDK(downloadUrl)
}

export async function setUpGraalVMRelease(
  gdsToken: string,
  version: string,
  javaVersion: string
): Promise<string> {
  const isEE = gdsToken.length > 0
  const toolName = determineToolName(isEE, version, javaVersion)
  let downloader: () => Promise<string>
  if (isEE) {
    downloader = async () => downloadGraalVMEE(gdsToken, version, javaVersion)
  } else {
    downloader = async () => downloadGraalVMCE(version, javaVersion)
  }
  return downloadExtractAndCacheJDK(downloader, toolName, version)
}

export function findHighestJavaVersion(
  release: c.LatestReleaseResponse['data'],
  version: string
): string {
  const graalVMIdentifierPattern = determineGraalVMIdentifier(
    false,
    version,
    '(\\d+)'
  )
  const expectedFileNameRegExp = new RegExp(
    `^${graalVMIdentifierPattern}${c.GRAALVM_FILE_EXTENSION.replace(
      /\./g,
      '\\.'
    )}$`
  )
  let highestJavaVersion = 0
  for (const asset of release.assets) {
    const matches = asset.name.match(expectedFileNameRegExp)
    if (matches) {
      const javaVersion = +matches[1]
      if (javaVersion > highestJavaVersion) {
        highestJavaVersion = javaVersion
      }
    }
  }
  if (highestJavaVersion > 0) {
    return String(highestJavaVersion)
  } else {
    throw new Error(
      'Could not find highest Java version. Please file an issue at: https://github.com/graalvm/setup-graalvm/issues.'
    )
  }
}

function findDownloadUrl(
  release: c.LatestReleaseResponse['data'],
  javaVersion: string
): string {
  const graalVMIdentifier = determineGraalVMIdentifier(
    false,
    c.VERSION_DEV,
    javaVersion
  )
  const expectedFileName = `${graalVMIdentifier}${c.GRAALVM_FILE_EXTENSION}`
  for (const asset of release.assets) {
    if (asset.name === expectedFileName) {
      return asset.browser_download_url
    }
  }
  throw new Error(
    `Could not find GraalVM dev build for Java ${javaVersion}. It may no longer be available, so please consider upgrading the Java version. If you think this is a mistake, please file an issue at: https://github.com/graalvm/setup-graalvm/issues.`
  )
}

function determineGraalVMIdentifier(
  isEE: boolean,
  version: string,
  javaVersion: string
): string {
  return `${determineToolName(isEE, version, javaVersion)}-${
    c.GRAALVM_ARCH
  }-${version}`
}

function determineToolName(
  isEE: boolean,
  version: string,
  javaVersion: string
): string {
  const infix = isEE ? 'ee' : version === c.VERSION_DEV ? 'community' : 'ce'
  return `graalvm-${infix}-java${javaVersion}-${c.GRAALVM_PLATFORM}`
}

async function downloadGraalVMCE(
  version: string,
  javaVersion: string
): Promise<string> {
  const graalVMIdentifier = determineGraalVMIdentifier(
    false,
    version,
    javaVersion
  )
  const downloadUrl = `${GRAALVM_CE_DL_BASE}/${GRAALVM_TAG_PREFIX}${version}/${graalVMIdentifier}${c.GRAALVM_FILE_EXTENSION}`
  try {
    return await downloadTool(downloadUrl)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      // Not Found
      throw new Error(
        `Failed to download ${graalVMIdentifier}. Are you sure version: '${version}' and java-version: '${javaVersion}' are correct?`
      )
    }
    throw new Error(
      `Failed to download ${graalVMIdentifier} (error: ${error}).`
    )
  }
}
