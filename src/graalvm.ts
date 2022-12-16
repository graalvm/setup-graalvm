import * as c from './constants'
import {
  downloadAndExtractJDK,
  downloadExtractAndCacheJDK,
  getLatestRelease
} from './utils'
import {downloadGraalVMEE} from './gds'
import {downloadTool} from '@actions/tool-cache'

const GRAALVM_CE_DL_BASE =
  'https://github.com/graalvm/graalvm-ce-builds/releases/download'
const GRAALVM_REPO_DEV_BUILDS = 'graalvm-ce-dev-builds'
const GRAALVM_REPO_RELEASES = 'graalvm-ce-builds'
const GRAALVM_TAG_PREFIX = 'vm-'

export async function setUpGraalVMLatest(
  gdsToken: string,
  javaVersion: string
): Promise<string> {
  if (gdsToken.length > 0) {
    return setUpGraalVMRelease(gdsToken, c.VERSION_LATEST, javaVersion)
  }
  const latestReleaseVersion = await getLatestReleaseVersion()
  return setUpGraalVMRelease(gdsToken, latestReleaseVersion, javaVersion)
}

export async function getLatestReleaseVersion(): Promise<string> {
  const latestRelease = await getLatestRelease(GRAALVM_REPO_RELEASES)
  const tag_name = latestRelease.tag_name
  if (tag_name.startsWith(GRAALVM_TAG_PREFIX)) {
    return tag_name.substring(GRAALVM_TAG_PREFIX.length, tag_name.length)
  }
  throw new Error(`Could not find latest GraalVM release: ${tag_name}`)
}

export async function setUpGraalVMDevBuild(
  gdsToken: string,
  javaVersion: string
): Promise<string> {
  if (gdsToken.length > 0) {
    throw new Error('Downloading GraalVM EE dev builds is not supported')
  }
  const latestDevBuild = await getLatestRelease(GRAALVM_REPO_DEV_BUILDS)
  const graalVMIdentifier = determineGraalVMIdentifier(
    false,
    'dev',
    javaVersion
  )
  const expectedFileName = `${graalVMIdentifier}${c.GRAALVM_FILE_EXTENSION}`
  for (const asset of latestDevBuild.assets) {
    if (asset.name === expectedFileName) {
      return downloadAndExtractJDK(asset.browser_download_url)
    }
  }
  throw new Error(
    `Could not find GraalVM dev build for Java ${javaVersion}. It may no longer be available, so please consider upgrading the Java version. If you think this is a mistake, please file an issue at: https://github.com/graalvm/setup-graalvm/issues.`
  )
}

export async function setUpGraalVMRelease(
  gdsToken: string,
  version: string,
  javaVersion: string
): Promise<string> {
  const isEE = gdsToken.length > 0
  const toolName = determineToolName(isEE, javaVersion)
  let downloader: () => Promise<string>
  if (isEE) {
    downloader = async () => downloadGraalVMEE(gdsToken, version, javaVersion)
  } else {
    downloader = async () => downloadGraalVMCE(version, javaVersion)
  }
  return downloadExtractAndCacheJDK(downloader, toolName, version)
}

function determineGraalVMIdentifier(
  isEE: boolean,
  version: string,
  javaVersion: string
): string {
  return `graalvm-${isEE ? 'ee' : 'ce'}-java${javaVersion}-${
    c.GRAALVM_PLATFORM
  }-${c.GRAALVM_ARCH}-${version}`
}

function determineToolName(isEE: boolean, javaVersion: string): string {
  return `graalvm-${isEE ? 'ee' : 'ce'}-java${javaVersion}-${
    c.GRAALVM_PLATFORM
  }`
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
        `Failed to download ${graalVMIdentifier}. Are you sure version: '${version}' and javaVersion: '${javaVersion}' are correct?`
      )
    }
    throw new Error(
      `Failed to download ${graalVMIdentifier} (error: ${error}).`
    )
  }
}
