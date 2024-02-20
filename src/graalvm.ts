import * as c from './constants'
import * as semver from 'semver'
import {
  downloadAndExtractJDK,
  downloadExtractAndCacheJDK,
  getContents,
  getLatestRelease,
  getMatchingTags,
  getTaggedRelease
} from './utils'
import {downloadGraalVMEELegacy} from './gds'
import {downloadTool} from '@actions/tool-cache'
import {basename} from 'path'

const GRAALVM_DL_BASE = 'https://download.oracle.com/graalvm'
const GRAALVM_CE_DL_BASE = `https://github.com/graalvm/${c.GRAALVM_RELEASES_REPO}/releases/download`
const ORACLE_GRAALVM_REPO_EA_BUILDS = 'oracle-graalvm-ea-builds'
const ORACLE_GRAALVM_REPO_EA_BUILDS_LATEST_SYMBOL = 'latest-ea'
const GRAALVM_REPO_DEV_BUILDS = 'graalvm-ce-dev-builds'
const GRAALVM_JDK_TAG_PREFIX = 'jdk-'
const GRAALVM_TAG_PREFIX = 'vm-'

// Support for GraalVM for JDK 17 and later

export async function setUpGraalVMJDK(
  javaVersionOrDev: string
): Promise<string> {
  if (javaVersionOrDev === c.VERSION_DEV) {
    return setUpGraalVMJDKDevBuild()
  }
  let javaVersion = javaVersionOrDev
  const toolName = determineToolName(javaVersion, false)
  let downloadName = toolName
  let downloadUrl: string
  if (javaVersion.endsWith('-ea')) {
    downloadUrl = await findLatestEABuildDownloadUrl(javaVersion)
    const filename = basename(downloadUrl)
    const resolvedVersion = semver.valid(semver.coerce(filename))
    if (!resolvedVersion) {
      throw new Error(
        `Unable to determine resolved version based on '${filename}'. ${c.ERROR_REQUEST}`
      )
    }
    javaVersion = resolvedVersion
  } else if (javaVersion.includes('.')) {
    if (semver.valid(javaVersion)) {
      const majorJavaVersion = semver.major(javaVersion)
      const minorJavaVersion = semver.minor(javaVersion)
      const patchJavaVersion = semver.patch(javaVersion)
      const isGARelease = minorJavaVersion === 0 && patchJavaVersion === 0
      if (isGARelease) {
        // For GA versions of JDKs, /archive/ does not use minor and patch version (see https://www.oracle.com/java/technologies/jdk-script-friendly-urls/)
        downloadName = determineToolName(majorJavaVersion.toString(), false)
      }
      downloadUrl = `${GRAALVM_DL_BASE}/${majorJavaVersion}/archive/${downloadName}${c.GRAALVM_FILE_EXTENSION}`
    } else {
      throw new Error(
        `java-version set to '${javaVersion}'. Please make sure the java-version is set correctly. ${c.ERROR_HINT}`
      )
    }
  } else {
    downloadUrl = `${GRAALVM_DL_BASE}/${javaVersion}/latest/${downloadName}${c.GRAALVM_FILE_EXTENSION}`
  }
  const downloader = async () => downloadGraalVMJDK(downloadUrl, javaVersion)
  return downloadExtractAndCacheJDK(downloader, toolName, javaVersion)
}

export async function findLatestEABuildDownloadUrl(
  javaEaVersion: string
): Promise<string> {
  const filePath = `versions/${javaEaVersion}.json`
  let response
  try {
    response = await getContents(ORACLE_GRAALVM_REPO_EA_BUILDS, filePath)
  } catch (error) {
    throw new Error(
      `Unable to resolve download URL for '${javaEaVersion}'. Please make sure the java-version is set correctly. ${c.ERROR_HINT}`
    )
  }
  if (
    Array.isArray(response) ||
    response.type !== 'file' ||
    !response.content
  ) {
    throw new Error(
      `Unexpected response when resolving download URL for '${javaEaVersion}'. ${c.ERROR_REQUEST}`
    )
  }
  const versionData = JSON.parse(
    Buffer.from(response.content, 'base64').toString('utf-8')
  )
  let latestVersion
  if (javaEaVersion === ORACLE_GRAALVM_REPO_EA_BUILDS_LATEST_SYMBOL) {
    latestVersion = versionData as c.OracleGraalVMEAVersion
  } else {
    latestVersion = (versionData as c.OracleGraalVMEAVersion[]).find(
      v => v.latest
    )
    if (!latestVersion) {
      throw new Error(
        `Unable to find latest version for '${javaEaVersion}'. ${c.ERROR_REQUEST}`
      )
    }
  }
  const file = latestVersion.files.find(
    f => f.arch === c.JDK_ARCH && f.platform === c.GRAALVM_PLATFORM
  )
  if (!file || !file.filename.startsWith('graalvm-jdk-')) {
    throw new Error(
      `Unable to find file metadata for '${javaEaVersion}'. ${c.ERROR_REQUEST}`
    )
  }
  return `${latestVersion.download_base_url}${file.filename}`
}

export async function setUpGraalVMJDKCE(
  javaVersionOrDev: string
): Promise<string> {
  if (javaVersionOrDev === c.VERSION_DEV) {
    return setUpGraalVMJDKDevBuild()
  }
  let javaVersion = javaVersionOrDev
  if (!javaVersion.includes('.')) {
    javaVersion = await findLatestGraalVMJDKCEJavaVersion(javaVersion)
  }
  if (javaVersion.split('.').length != 3) {
    throw new Error(
      `java-version set to '${javaVersionOrDev}', which was resolved to '${javaVersion}'. Please make sure the java-version is set correctly. ${c.ERROR_HINT}`
    )
  }
  const toolName = determineToolName(javaVersion, true)
  const downloadUrl = `${GRAALVM_CE_DL_BASE}/jdk-${javaVersion}/${toolName}${c.GRAALVM_FILE_EXTENSION}`
  const downloader = async () => downloadGraalVMJDK(downloadUrl, javaVersion)
  return downloadExtractAndCacheJDK(downloader, toolName, javaVersion)
}

export async function findLatestGraalVMJDKCEJavaVersion(
  majorJavaVersion: string
): Promise<string> {
  const matchingRefs = await getMatchingTags(
    c.GRAALVM_GH_USER,
    c.GRAALVM_RELEASES_REPO,
    `${GRAALVM_JDK_TAG_PREFIX}${majorJavaVersion}`
  )
  const lowestNonExistingVersion = '0.0.1'
  let highestVersion = lowestNonExistingVersion
  const versionNumberStartIndex = `refs/tags/${GRAALVM_JDK_TAG_PREFIX}`.length
  for (const matchingRef of matchingRefs) {
    const currentVersion = matchingRef.ref.substring(versionNumberStartIndex)
    if (
      semver.valid(currentVersion) &&
      semver.gt(currentVersion, highestVersion)
    ) {
      highestVersion = currentVersion
    }
  }
  if (highestVersion === lowestNonExistingVersion) {
    throw new Error(
      `Unable to find the latest Java version for '${majorJavaVersion}'. Please make sure the java-version is set correctly. ${c.ERROR_HINT}`
    )
  }
  return highestVersion
}

function determineToolName(javaVersion: string, isCommunity: boolean) {
  return `graalvm${isCommunity ? '-community' : ''}-jdk-${javaVersion}_${
    c.JDK_PLATFORM
  }-${c.JDK_ARCH}_bin`
}

async function downloadGraalVMJDK(
  downloadUrl: string,
  javaVersion: string
): Promise<string> {
  try {
    return await downloadTool(downloadUrl)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      // Not Found
      throw new Error(
        `Failed to download ${basename(
          downloadUrl
        )}. Are you sure java-version: '${javaVersion}' is correct?`
      )
    }
    throw new Error(
      `Failed to download ${basename(downloadUrl)} (error: ${error}).`
    )
  }
}

// Support for GraalVM dev builds

export async function setUpGraalVMJDKDevBuild(): Promise<string> {
  const latestDevBuild = await getLatestRelease(GRAALVM_REPO_DEV_BUILDS)
  const resolvedJavaVersion = findHighestJavaVersion(
    latestDevBuild,
    c.VERSION_DEV
  )
  const downloadUrl = findDownloadUrl(latestDevBuild, resolvedJavaVersion)
  return downloadAndExtractJDK(downloadUrl)
}

export function findHighestJavaVersion(
  release: c.LatestReleaseResponse['data'],
  version: string
): string {
  const graalVMIdentifierPattern = determineGraalVMLegacyIdentifier(
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

// Support for GraalVM 22.X releases and earlier

export async function setUpGraalVMLatest_22_X(
  gdsToken: string,
  javaVersion: string
): Promise<string> {
  const lockedVersion = javaVersion === '19' ? '22.3.1' : '22.3.3'
  if (gdsToken.length > 0) {
    return setUpGraalVMRelease(gdsToken, lockedVersion, javaVersion)
  }
  const latestRelease = await getTaggedRelease(
    c.GRAALVM_GH_USER,
    c.GRAALVM_RELEASES_REPO,
    GRAALVM_TAG_PREFIX + lockedVersion
  )
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

export async function setUpGraalVMRelease(
  gdsToken: string,
  version: string,
  javaVersion: string
): Promise<string> {
  const isEE = gdsToken.length > 0
  const toolName = determineLegacyToolName(isEE, version, javaVersion)
  let downloader: () => Promise<string>
  if (isEE) {
    downloader = async () =>
      downloadGraalVMEELegacy(gdsToken, version, javaVersion)
  } else {
    downloader = async () => downloadGraalVMCELegacy(version, javaVersion)
  }
  return downloadExtractAndCacheJDK(downloader, toolName, version)
}

function findDownloadUrl(
  release: c.LatestReleaseResponse['data'],
  javaVersion: string
): string {
  const graalVMIdentifier = determineGraalVMLegacyIdentifier(
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
    `Could not find GraalVM dev build for Java ${javaVersion}. It may no longer be available, so please consider upgrading the Java version. ${c.ERROR_HINT}`
  )
}

function determineGraalVMLegacyIdentifier(
  isEE: boolean,
  version: string,
  javaVersion: string
): string {
  return `${determineLegacyToolName(isEE, version, javaVersion)}-${
    c.GRAALVM_ARCH
  }-${version}`
}

function determineLegacyToolName(
  isEE: boolean,
  version: string,
  javaVersion: string
): string {
  const infix = isEE ? 'ee' : version === c.VERSION_DEV ? 'community' : 'ce'
  return `graalvm-${infix}-java${javaVersion}-${c.GRAALVM_PLATFORM}`
}

async function downloadGraalVMCELegacy(
  version: string,
  javaVersion: string
): Promise<string> {
  const graalVMIdentifier = determineGraalVMLegacyIdentifier(
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
