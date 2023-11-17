import * as c from './constants'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as httpClient from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import {ExecOptions, exec as e} from '@actions/exec'
import {readFileSync, readdirSync} from 'fs'
//import {Octokit} from '@octokit/core'
import {createHash} from 'crypto'
import {join} from 'path'
import {Base64} from "js-base64";
import { Octokit } from '@octokit/rest';
import fetch from "node-fetch";
import {Context} from "@actions/github/lib/context";

// Set up Octokit for github.com only and in the same way as @actions/github (see https://git.io/Jy9YP)
const baseUrl = 'https://api.github.com'
const GitHubDotCom = Octokit.defaults({
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
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
        owner: c.GRAALVM_GH_USER,
        repo
      })
  ).data
}

export async function getTaggedRelease(
    repo: string,
    tag: string
): Promise<c.LatestReleaseResponse['data']> {
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
        owner: c.GRAALVM_GH_USER,
        repo,
        tag
      })
  ).data
}

export async function getMatchingTags(
    tagPrefix: string
): Promise<c.MatchingRefsResponse['data']> {
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request(
          'GET /repos/{owner}/{repo}/git/matching-refs/tags/{tagPrefix}',
          {
            owner: c.GRAALVM_GH_USER,
            repo: c.GRAALVM_RELEASES_REPO,
            tagPrefix
          }
      )
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
export function toSemVer(version: string): string {
  const parts = version.split('.')
  const major = parts[0]
  const minor = parts.length > 1 ? parts[1] : '0'
  const patch = parts.length > 2 ? parts.slice(2).join('-') : '0'
  return `${major}.${minor}.${patch}`
}

export function isPREvent(): boolean {
  return process.env[c.ENV_GITHUB_EVENT_NAME] === c.EVENT_NAME_PULL_REQUEST
}

function getGitHubToken(): string {
  return core.getInput(c.INPUT_GITHUB_TOKEN)
}

function getCommitSha(): string {
    return process.env.GITHUB_SHA || "default_sha"
}

function getPrBaseBranchSha(): string {
    return  process.env.GITHUB_BASE_REF || "default_branch"
}

export async function createPRComment(content: string): Promise<void> {
  if (!isPREvent()) {
    throw new Error('Not a PR event.')
  }
  const context = github.context
  try {
    await github.getOctokit(getGitHubToken()).rest.issues.createComment({
      ...context.repo,
      issue_number: context.payload.pull_request?.number as number,
      body: content
    })
  } catch (err) {
    core.error(
        `Failed to create pull request comment. Please make sure this job has 'write' permissions for the 'pull-requests' scope (see https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions)? Internal error: ${err}`
    )
  }
}

export async function createRef(sha: string) {
    try {
        const commitSha = getCommitSha()
        const ref = c.METRIC_REF_PATH + commitSha
        core.info(`creating ref ${ref} for metrics tree ${sha}`);
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        });
        const context = github.context
        await octokit.request(
            `POST /repos/${context.repo.owner}/${context.repo.repo}/git/refs`,
            {
                ...context.repo,
                ref,
                sha,
            }
        );
    } catch(err) {
        core.error(
            `Failed to create ref. Please make sure that the referred sha '${sha}' exist.`
        )
    }
}

export async function createTree(metadataJson: string): Promise<string> {
    try {

    const octokit = new Octokit({
        auth: getGitHubToken(),
        request: {
            fetch: fetch,
        },
    });
    const context = github.context
    core.info(`creating tree at ${context.repo.owner}/${context.repo.repo}`);
    const response = await octokit.request(
        `POST /repos/${context.repo.owner}/${context.repo.repo}/git/trees`,
        {
            ...context.repo,
            tree: [
                {
                    path: "metadataJson",
                    mode: "100644",
                    type: "blob",
                    content: metadataJson,
                },
            ],
        }
    );

    core.info("Tree-sha" + response.data.sha);
    return response.data.sha;
    } catch (err) {
        core.error(
            `Creating metrics tree failed.`
        )
    }
}

export async function getPrBaseBranchMetrics(): Promise<string> {
    if (!isPREvent()) {
        throw new Error('Not a PR event.')
    }
    const context = github.context
    const octokit = new Octokit({
        auth: getGitHubToken(),
        request: {
            fetch: fetch,
        },
    })
    const baseCommitSha = await getBaseBranchCommitSha(octokit, context)
    core.info(baseCommitSha)
    const blobTreeSha = await getBlobTreeSha(octokit, context, baseCommitSha)
    core.info(blobTreeSha)
    const blobSha = await getBlobSha(octokit, context, blobTreeSha)
    core.info(blobSha)
    const blobContent = await getBlobContent(octokit, context, blobSha)
    core.info(blobContent)
    return blobContent
}

async function getBaseBranchCommitSha(octokit: Octokit, context: Context): Promise<string> {
    const prBaseSha = getPrBaseBranchSha()
    core.info(prBaseSha)
    const { data } = await octokit.request(`GET /repos/${context.repo.owner}/${context.repo.repo}/git/ref/heads/${prBaseSha}`, {
        ...context.repo,
        ref: 'heads/' + prBaseSha,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    core.info(data)
    return data.object.sha
}

async function getBlobTreeSha(octokit: Octokit, context: Context, baseCommitSha: string): Promise<string> {
    const { data } = await octokit.request(, {
        ...context.repo,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    core.info(data)
    return data.object.sha
}

async function getBlobSha(octokit: Octokit, context: Context, blobTreeSha: string) {
    const { data } = await octokit.request(`GET /repos/${context.repo.owner}/${context.repo.repo}/git/trees/${blobTreeSha}`,    {
        ...context.repo,
        tree_sha: blobTreeSha,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    core.info(data)
    return data.tree[0].sha
}

async function getBlobContent(octokit: Octokit, context: Context, blobSha: string) {
    const { data } = await octokit.request(`GET /repos/${context.repo.owner}/${context.repo.repo}/git/blobs/${blobSha}`, {
        ...context.repo,
        file_sha: blobSha,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    core.info(data)
    return Base64.decode(data.content)
}