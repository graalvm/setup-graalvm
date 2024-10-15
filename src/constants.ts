import * as otypes from '@octokit/types'

export const ACTION_VERSION = '1.2.4'

export const INPUT_VERSION = 'version'
export const INPUT_GDS_TOKEN = 'gds-token'
export const INPUT_JAVA_VERSION = 'java-version'
export const INPUT_JAVA_PACKAGE = 'java-package'
export const INPUT_DISTRIBUTION = 'distribution'
export const INPUT_COMPONENTS = 'components'
export const INPUT_GITHUB_TOKEN = 'github-token'
export const INPUT_SET_JAVA_HOME = 'set-java-home'
export const INPUT_CACHE = 'cache'
export const INPUT_CHECK_FOR_UPDATES = 'check-for-updates'
export const INPUT_NI_MUSL = 'native-image-musl'

export const IS_LINUX = process.platform === 'linux'
export const IS_MACOS = process.platform === 'darwin'
export const IS_WINDOWS = process.platform === 'win32'

export const EXECUTABLE_SUFFIX = IS_WINDOWS ? '.exe' : ''

export const DISTRIBUTION_GRAALVM = 'graalvm'
export const DISTRIBUTION_GRAALVM_COMMUNITY = 'graalvm-community'
export const DISTRIBUTION_MANDREL = 'mandrel'
export const DISTRIBUTION_LIBERICA = 'liberica'

export const VERSION_DEV = 'dev'
export const VERSION_LATEST = 'latest'

export const JDK_ARCH = determineJDKArchitecture()
export const JDK_PLATFORM = determineJDKPlatform()
export const JDK_HOME_SUFFIX = IS_MACOS ? '/Contents/Home' : ''

export const GRAALVM_ARCH = determineGraalVMArchitecture()
export const GRAALVM_FILE_EXTENSION = IS_WINDOWS ? '.zip' : '.tar.gz'
export const GRAALVM_GH_USER = 'graalvm'
export const GRAALVM_PLATFORM = IS_WINDOWS ? 'windows' : process.platform
export const GRAALVM_RELEASES_REPO = 'graalvm-ce-builds'

export const MANDREL_NAMESPACE = 'mandrel-'

export const GDS_BASE = 'https://gds.oracle.com/api/20220101'
export const GDS_GRAALVM_PRODUCT_ID = 'D53FAE8052773FFAE0530F15000AA6C6'

export const ENV_GITHUB_EVENT_NAME = 'GITHUB_EVENT_NAME'
export const EVENT_NAME_PULL_REQUEST = 'pull_request'

export const ERROR_REQUEST =
  'Please file an issue at: https://github.com/graalvm/setup-graalvm/issues.'

export const ERROR_HINT =
  'If you think this is a mistake, please file an issue at: https://github.com/graalvm/setup-graalvm/issues.'

export type LatestReleaseResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']

export type MatchingRefsResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/git/matching-refs/{ref}']['response']

export type ReleasesResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/releases']['response']

export type ContentsResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/contents/{path}']['response']

export interface OracleGraalVMEAFile {
  filename: string
  arch: 'aarch64' | 'x64'
  platform: 'darwin' | 'linux' | 'windows'
}

export interface OracleGraalVMEAVersion {
  version: string
  latest?: boolean
  download_base_url: string
  files: OracleGraalVMEAFile[]
}

function determineJDKArchitecture(): string {
  switch (process.arch) {
    case 'x64': {
      return 'x64'
    }
    case 'arm64': {
      return 'aarch64'
    }
    default: {
      throw new Error(`Unsupported architecture: ${process.arch}`)
    }
  }
}

function determineJDKPlatform(): string {
  switch (process.platform) {
    case 'linux': {
      return 'linux'
    }
    case 'darwin': {
      return 'macos'
    }
    case 'win32': {
      return 'windows'
    }
    default: {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }
}

function determineGraalVMArchitecture(): string {
  switch (process.arch) {
    case 'x64': {
      return 'amd64'
    }
    case 'arm64': {
      return 'aarch64'
    }
    default: {
      throw new Error(`Unsupported architecture: ${process.arch}`)
    }
  }
}
