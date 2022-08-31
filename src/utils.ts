import * as c from './constants'
import * as core from '@actions/core'
import * as httpClient from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import {ExecOptions, exec as e} from '@actions/exec'
import {readFileSync, readdirSync} from 'fs'
import {Octokit} from '@octokit/core'
import {createHash} from 'crypto'
import {join} from 'path'

// Set up Octokit in the same way as @actions/github (see https://git.io/Jy9YP)
const baseUrl = process.env['GITHUB_API_URL'] || 'https://api.github.com'
const GitHub = Octokit.defaults({
  baseUrl,
  request: {
    agent: new httpClient.HttpClient().getAgent(baseUrl)
  }
})

export async function exec(
  commandLine: string,
  args?: string[],
  options?: ExecOptions | undefined
): Promise<void> {
  const exitCode = await e(commandLine, args, options)
  if (exitCode !== 0) {
    throw new Error(
      `'${[commandLine]
        .concat(args || [])
        .join(' ')}' exited with a non-zero code: ${exitCode}`
    )
  }
}

export async function getLatestRelease(
  repo: string
): Promise<c.LatestReleaseResponse['data']> {
  const githubToken = core.getInput('github-token')
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHub(options)
  return (
    await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
      owner: c.GRAALVM_GH_USER,
      repo
    })
  ).data
}

export async function downloadAndExtractJDK(
  downloadUrl: string
): Promise<string> {
  return findJavaHomeInSubfolder(
    await extract(await tc.downloadTool(downloadUrl))
  )
}

export async function downloadExtractAndCacheJDK(
  downloader: () => Promise<string>,
  toolName: string,
  version: string
): Promise<string> {
  const semVersion = toSemVer(version)
  let toolPath = tc.find(toolName, semVersion)
  if (toolPath) {
    core.info(`Found ${toolName} ${version} in tool-cache @ ${toolPath}`)
  } else {
    const extractDir = await extract(await downloader())
    core.info(`Adding ${toolName} ${version} to tool-cache ...`)
    toolPath = await tc.cacheDir(extractDir, toolName, semVersion)
  }
  return findJavaHomeInSubfolder(toolPath)
}

export function calculateSHA256(filePath: string): string {
  const hashSum = createHash('sha256')
  hashSum.update(readFileSync(filePath))
  return hashSum.digest('hex')
}

async function extract(downloadPath: string): Promise<string> {
  if (c.GRAALVM_FILE_EXTENSION === '.tar.gz') {
    return await tc.extractTar(downloadPath)
  } else if (c.GRAALVM_FILE_EXTENSION === '.zip') {
    return await tc.extractZip(downloadPath)
  } else {
    throw new Error(
      `Unexpected filetype downloaded: ${c.GRAALVM_FILE_EXTENSION}`
    )
  }
}

function findJavaHomeInSubfolder(searchPath: string): string {
  const baseContents = readdirSync(searchPath)
  if (baseContents.length === 1) {
    return join(searchPath, baseContents[0], c.JDK_HOME_SUFFIX)
  } else {
    throw new Error(
      `Unexpected amount of directory items found: ${baseContents.length}`
    )
  }
}

/**
 * This helper turns GraalVM version numbers (e.g., `22.0.0.2`) into valid
 * semver.org versions (e.g., `22.0.0-2`), which is needed because
 * @actions/tool-cache uses `semver` to validate versions.
 */
function toSemVer(version: string): string {
  const parts = version.split('.')
  const major = parts[0]
  const minor = parts.length > 1 ? parts[1] : '0'
  const patch = parts.length > 2 ? parts.slice(2).join('-') : '0'
  return `${major}.${minor}.${patch}`
}
