import * as c from './constants'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as httpClient from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import {exec as e, ExecOptions} from '@actions/exec'
import * as fs from 'fs'
import {readdirSync, readFileSync} from 'fs'
import {createHash} from 'crypto'
import {join} from 'path'
import {Base64} from "js-base64";
import {Octokit} from '@octokit/rest';
import fetch from "node-fetch";
import {Context} from "@actions/github/lib/context";
import {DateTime} from 'luxon'
import { Chart, registerables } from 'chart.js';
import { createCanvas } from 'canvas';


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
        const ref = 'refs/' + c.METRIC_PATH + '/' + commitSha
        core.info(`creating reference with ref '${ref}' for metrics tree ${sha}`);
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        });
        await octokit.request(c.OCTOKIT_ROUTE_CREATE_REF,
            {
                ...github.context.repo,
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
        const response = await octokit.request(c.OCTOKIT_ROUTE_CREATE_TREE,
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

        return response.data.sha;
    } catch (err) {
        core.error(
            `Creating metrics tree failed.`
        )
        return ''
    }
}

export async function getPrBaseBranchMetrics(): Promise<string> {
    if (!isPREvent()) {
        throw new Error('Not a PR event.')
    }
    try {
        const context = github.context
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        })
        const baseCommitSha = await getBaseBranchCommitSha(octokit, context)
        const blobTreeSha = await getBlobTreeSha(octokit, context, baseCommitSha)
        const blobSha = await getBlobSha(octokit, context, blobTreeSha)
        return await getBlobContent(octokit, context, blobSha)
    } catch (err) {
        core.error('Failed to get build metrics for PR base branch.')
        return ''
    }
}

async function getBaseBranchCommitSha(octokit: Octokit, context: Context): Promise<string> {
    const prBaseBranchName = getPrBaseBranchSha()
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_REF + c.OCTOKIT_REF_BRANCHE_PREFIX + '/' + prBaseBranchName, {
        ...context.repo,
        ref: c.OCTOKIT_REF_BRANCHE_PREFIX + '/' + prBaseBranchName,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.object.sha
}

async function getBlobTreeSha(octokit: Octokit, context: Context, baseCommitSha: string): Promise<string> {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_REF_METRICS + baseCommitSha, {
        ...context.repo,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.object.sha
}

async function getBlobSha(octokit: Octokit, context: Context, blobTreeSha: string) {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_TREE + blobTreeSha,    {
        ...context.repo,
        tree_sha: blobTreeSha,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.tree[0].sha
}

async function getBlobContent(octokit: Octokit, context: Context, blobSha: string) {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_BLOB + blobSha, {
        ...context.repo,
        file_sha: blobSha,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return Base64.decode(data.content)
}
/*
export async function getPushEvents(numberOfBuilds: number): Promise<any[]> {
    try {
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        });
        const context = github.context
        const eventResponse = await octokit.request(c.OCTOKIT_ROUTE_GET_EVENTS, {
            ...context.repo,
            headers: c.OCTOKIT_BASIC_HEADER
        })
        let linkHeader = eventResponse.headers.link
        const eventData: any = eventResponse.data
        const pushEvents = []
        let eventsLeft = numberOfBuilds

        for (let event of eventData) {
            if (eventsLeft <= 0) {
                break;
            }
            if (
                event.type === "PushEvent" &&
                event.payload!.ref! === process.env.GITHUB_REF
            ) {
                pushEvents.push(event);
                eventsLeft = eventsLeft-1;
            }
        }

        let nextPageMatch = /<([^>]+)>;\s*rel="next"/;
        while (
            linkHeader &&
            linkHeader.includes('rel="next"') &&
            eventsLeft > 0
            ) {
            let nextPageUrl = nextPageMatch?.exec(linkHeader)![1];
            // Make the request for the next page
            // Assuming you use fetch API or similar for making HTTP requests
            fetch(nextPageUrl, {
                headers: {
                    Authorization: "Bearer " + getGitHubToken(),
                },
            })
                .then((response) => response.json())
                .then((nextPageResponse) => {
                    for (let event of nextPageResponse) {
                        if (eventsLeft <= 0) {
                            break;
                        }
                        if (
                            event.type === "PushEvent" &&
                            event.payload.ref === process.env.GITHUB_REF
                        ) {
                            pushEvents.push(event);
                            eventsLeft = eventsLeft-1;
                        }
                    }

                    // Update the link_header for the next iteration
                    linkHeader = eventResponse.headers.link;
                })
                .catch((error) => {
                    console.error("Error fetching next page:", error);
                });
        }
        return pushEvents
    } catch (err) {
        console.info("An error occurred during getting metrics data.")
        return []
    }
}

export function formatTimestamps(timestamps: string[]) {
    const formattedTimestamps = []
    for (let i=0; i<timestamps.length; i++) {
        let commitTime = DateTime.fromISO(timestamps[i]);
        let commitTimeUtc = commitTime.setZone('UTC');
        let commitTimeLocal = commitTimeUtc.setZone('Europe/Berlin');
        let formatter = 'dd/MM/YYYY';
        formattedTimestamps.push(commitTimeLocal.toFormat(formatter));
    }
    return(formattedTimestamps)
}

export async function getImageData(shas: string[]) {
    const context = github.context
    const octokit = new Octokit({
        auth: getGitHubToken(),
        request: {
            fetch: fetch,
        },
    });
    const imageData = []
    core.info(String(shas))
    for (let i=0; i< shas.length; i++) {
        core.info("reent sha: " + shas[i])
        const blobTreeSha = await getBlobTreeSha(octokit, context, shas[i])
        const blobSha = await getBlobSha(octokit, context, blobTreeSha)
        imageData.push(await getBlobContent(octokit, context, blobSha))
    }
    return imageData
}*/


function formatDate(date: string, n: number) {
    // Parse the timestamp and convert it to the desired timezone
    const commitTime = DateTime.fromISO(date, { zone: 'utc' });
    const commitTimeLocal = commitTime.setZone('Europe/Berlin');

    if (n >= 30) {
        return commitTimeLocal.toFormat('dd.MM.\HH:mm');
    } else {
        return commitTimeLocal.toFormat('dd.MM.yyyy \n HH:mm');
    }
}

async function getImageData(commitSha: string) {
    const octokit = new Octokit({
        auth: getGitHubToken(),
    });

    const context = github.context
    try {
        // Get the reference SHA
        const refResponse = await octokit.git.getRef({
            ...context.repo,
            ref: `graalvm-metrics/${commitSha}`,
        });
        const refSha = refResponse.data.object.sha;

        console.log(refSha)

        // Get the tree SHA
        const treeResponse = await octokit.git.getTree({
            ...context.repo,
            tree_sha: refSha,
        });
        const blobSha = treeResponse.data.tree[0].sha;

        // Get the blob content
        const blobResponse = await octokit.git.getBlob({
            ...context.repo,
            file_sha: String(blobSha),
        });

        const content = Buffer.from(blobResponse.data.content, 'base64').toString('utf-8');
        const data = JSON.parse(content);

        console.log(data.image_details.total_bytes / 1e6)

        return [
            data.image_details.total_bytes / 1e6,
            data.image_details.code_area.bytes / 1e6,
            data.image_details.image_heap.bytes / 1e6,
        ];
    } catch (err) {
        console.error('Error fetching image data');
        return [0, 0, 0];
    }
}

// Function to fetch data
async function fetchData() {
    const octokit = new Octokit({
        auth: getGitHubToken(),
    });
    return new Promise(async (resolve) => {

        const response = await octokit.request(c.OCTOKIT_ROUTE_GET_EVENTS, {
            ...github.context.repo,
            headers: c.OCTOKIT_BASIC_HEADER
        })

        // get push events
        const pushEvents = await getPushEvents(response);

        // Prepare data
        const timestamps = [];
        const shas = [];

        for (const pushEvent of pushEvents) {
            timestamps.push(pushEvent.created_at);
            shas.push(pushEvent.payload.commits[pushEvent.payload.commits.length - 1].sha);
        }

        // Extract data for plotting
        const commitDates = timestamps.map(timestamp => formatDate(timestamp, Number(core.getInput('build-counts-for-metric-history'))));
        const imageDataPromises = shas.map(async sha => await getImageData(sha));
        const imageData = await Promise.all(imageDataPromises);
        const imageSizes = imageData.filter(entry => entry).map(entry => entry[0]);
        const codeAreaSizes = imageData.filter(entry => entry).map(entry => entry[1]);
        const imageHeapSizes = imageData.filter(entry => entry).map(entry => entry[2]);

        const data= {
            commitDates: commitDates,
            imageData: imageData,
            imageSizes: imageSizes,
            codeAreaSizes: codeAreaSizes,
            imageHeapSizes: imageHeapSizes
        }

        resolve(data);
    });
}

async function getPushEvents(response:any) {
    const eventsArray = response.data;
    let linkHeader = response.headers.link;
    let commitsLeft = Number(core.getInput('build-counts-for-metric-history'));
    const pushEvents = [];

    for (const event of eventsArray) {
        if (commitsLeft <= 0) {
            break;
        }
        if (event.type === "PushEvent" && event.payload.ref === process.env.GITHUB_REF) {
            pushEvents.push(event);
            commitsLeft -= 1;
        }
    }

    while (linkHeader && linkHeader.includes('rel="next"') && commitsLeft > 0) {
        // Extract the URL for the next page
        const nextPageMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        const nextPageUrl = nextPageMatch ? nextPageMatch[1] : null;

        // Make the request for the next page
        const response = await fetch(nextPageUrl, {
            headers: {
                Authorization: getGitHubToken(),
            },
        });

        const responseJson = await response.json();

        for (const event of responseJson) {
            if (commitsLeft <= 0) {
                break;
            }
            if (event.type === "PushEvent" && event.payload.ref === process.env.GITHUB_REF) {
                pushEvents.push(event);
                commitsLeft -= 1;
            }
        }

        // Update linkHeader for the next iteration
        linkHeader = response.headers.get("link");
    }
    return pushEvents;
}

function createDatasets(data: any) {
    const labels = data.commitDates.reverse();

    const datasets = [
        {
            label: 'Image Sizes',
            data: data.imageSizes.reverse(),
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            pointRadius: 5,
            pointHoverRadius: 8,
            yAxisID: 'y-axis-1',
        },
        {
            label: 'Code Area Sizes',
            data: data.codeAreaSizes.reverse(),
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            pointRadius: 5,
            pointHoverRadius: 8,
            yAxisID: 'y-axis-1',
        },
        {
            label: 'Image Heap Sizes',
            data: data.imageHeapSizes.reverse(),
            borderColor: 'rgba(255, 205, 86, 1)',
            backgroundColor: 'rgba(255, 205, 86, 0.2)',
            pointRadius: 5,
            pointHoverRadius: 8,
            yAxisID: 'y-axis-1',
        },
    ];

    return {
        labels: labels,
        datasets: datasets,
    };
}

export async function createChart() {
    try {
        const data = await fetchData();

        console.log(data)

        // Set up canvas
        const canvas = createCanvas(800, 400);

        await Chart.register(...registerables); // Register Chart.js plugins

        // Save the canvas as a PNG file
        const out = fs.createWriteStream('output_chart.png');
        const stream = canvas.createPNGStream();
        stream.pipe(out);
        out.on('finish', () => console.log('The PNG file was created.'));
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Call the createChart function
//createChart();
