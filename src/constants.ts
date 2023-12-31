import * as otypes from '@octokit/types'
import {context} from "@actions/github";
import exp from "constants";

export const INPUT_VERSION = 'version'
export const INPUT_GDS_TOKEN = 'gds-token'
export const INPUT_JAVA_VERSION = 'java-version'
export const INPUT_DISTRIBUTION = 'distribution'
export const INPUT_COMPONENTS = 'components'
export const INPUT_GITHUB_TOKEN = 'github-token'
export const INPUT_PAT_TOKEN = 'pat-token'
export const INPUT_SET_JAVA_HOME = 'set-java-home'
export const INPUT_CACHE = 'cache'
export const INPUT_CHECK_FOR_UPDATES = 'check-for-updates'
export const INPUT_NI_MUSL = 'native-image-musl'

export const IS_LINUX = process.platform === 'linux'
export const IS_MACOS = process.platform === 'darwin'
export const IS_WINDOWS = process.platform === 'win32'

export const DISTRIBUTION_GRAALVM = 'graalvm'
export const DISTRIBUTION_GRAALVM_COMMUNITY = 'graalvm-community'
export const DISTRIBUTION_MANDREL = 'mandrel'

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

export const ERROR_HINT =
  'If you think this is a mistake, please file an issue at: https://github.com/graalvm/setup-graalvm/issues.'

export const INPUT_NI_HISTORY_BUILD_COUNT = 'build-counts-for-metric-history'

export const METRIC_PATH = 'graalvm-metrics'
export const OCTOKIT_REF_BRANCHE_PREFIX = 'heads'

export const OCTOKIT_ROUTE_CREATE_REF = 'POST /repos/{owner}/{repo}/git/refs'
export const OCTOKIT_ROUTE_CREATE_TREE = 'POST /repos/{owner}/{repo}/git/trees'
export const OCTOKIT_ROUTE_GET_REF = 'GET /repos/{owner}/{repo}/git/ref/'
export const OCTOKIT_ROUTE_GET_REF_METRICS = `GET /repos/{owner}/{repo}/git/ref/${METRIC_PATH}/`
export const OCTOKIT_ROUTE_GET_TREE = 'GET /repos/{owner}/{repo}/git/trees/'
export const OCTOKIT_ROUTE_GET_BLOB = 'GET /repos/{owner}/{repo}/git/blobs/'
export const OCTOKIT_ROUTE_GET_EVENTS = 'GET /networks/{owner}/{repo}/events'
export const OCTOKIT_BASIC_HEADER = {'X-GitHub-Api-Version': '2022-11-28'}


export type LatestReleaseResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']

export type MatchingRefsResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/git/matching-refs/{ref}']['response']

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
