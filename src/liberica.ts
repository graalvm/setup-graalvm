import * as c from './constants'
import * as semver from 'semver'
import { downloadExtractAndCacheJDK, getTaggedRelease, getMatchingTags } from './utils'
import { downloadTool } from '@actions/tool-cache'
import { spawnSync } from 'child_process'

const LIBERICA_GH_USER = 'bell-sw'
const LIBERICA_RELEASES_REPO = 'LibericaNIK'
const LIBERICA_JDK_TAG_PREFIX = 'jdk-'
const LIBERICA_VM_PREFIX = 'bellsoft-liberica-vm-'

export async function setUpLiberica(javaVersion: string, javaPackage: string): Promise<string> {
  const resolvedJavaVersion = await findLatestLibericaJavaVersion(javaVersion)
  const downloadUrl = await findLibericaURL(resolvedJavaVersion, javaPackage)
  const toolName = determineToolName(javaVersion, javaPackage)
  return downloadExtractAndCacheJDK(async () => downloadTool(downloadUrl), toolName, javaVersion)
}

export async function findLatestLibericaJavaVersion(javaVersion: string): Promise<string> {
  const matchingRefs = await getMatchingTags(
    LIBERICA_GH_USER,
    LIBERICA_RELEASES_REPO,
    `${LIBERICA_JDK_TAG_PREFIX}${javaVersion}`
  )
  const noMatch = '0.0.1'
  let bestMatch = noMatch
  const prefixLength = `refs/tags/${LIBERICA_JDK_TAG_PREFIX}`.length
  const patternLength = javaVersion.length
  for (const matchingRef of matchingRefs) {
    const version = matchingRef.ref.substring(prefixLength)
    if (
      semver.valid(version) &&
      // pattern '17.0.1' should match '17.0.1+12' but not '17.0.10'
      (version.length <= patternLength || !isDigit(version.charAt(patternLength))) &&
      semver.compareBuild(version, bestMatch) == 1
    ) {
      bestMatch = version
    }
  }
  if (bestMatch === noMatch) {
    throw new Error(
      `Unable to find the latest version for JDK${javaVersion}. Please make sure the java-version is set correctly. ${c.ERROR_HINT}`
    )
  }
  return bestMatch
}

export async function findLibericaURL(javaVersion: string, javaPackage: string): Promise<string> {
  const release = await getTaggedRelease(
    LIBERICA_GH_USER,
    LIBERICA_RELEASES_REPO,
    LIBERICA_JDK_TAG_PREFIX + javaVersion
  )
  const platform = determinePlatformPart()
  const assetPrefix = `${LIBERICA_VM_PREFIX}${determineVariantPart(javaPackage)}openjdk${javaVersion}`
  const assetSuffix = `-${platform}${c.GRAALVM_FILE_EXTENSION}`
  for (const asset of release.assets) {
    if (asset.name.startsWith(assetPrefix) && asset.name.endsWith(assetSuffix)) {
      return asset.browser_download_url
    }
  }
  throw new Error(
    `Unable to find asset for java-version: ${javaVersion}, java-package: ${javaPackage}, platform: ${platform}. ${c.ERROR_REQUEST}`
  )
}

function determineToolName(javaVersion: string, javaPackage: string) {
  const variant = determineVariantPart(javaPackage)
  const platform = determinePlatformPart()
  return `${LIBERICA_VM_PREFIX}${variant}${platform}`
}

function determineVariantPart(javaPackage: string) {
  return javaPackage !== null && javaPackage.includes('+fx') ? 'full-' : ''
}

function determinePlatformPart() {
  if (isMuslBasedLinux()) {
    return `linux-${c.JDK_ARCH}-musl`
  } else {
    return `${c.JDK_PLATFORM}-${c.GRAALVM_ARCH}`
  }
}

function isMuslBasedLinux() {
  if (c.IS_LINUX) {
    const output = spawnSync('ldd', ['--version']).stderr.toString('utf8')
    if (output.includes('musl')) {
      return true
    }
  }
  return false
}

function isDigit(c: string) {
  return c.charAt(0) >= '0' && c.charAt(0) <= '9'
}
