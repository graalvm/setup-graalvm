import * as core from "@actions/core";
import * as c from './constants';
import { getGVMversion } from "./utils";

export async function isNativeImageBuildReport(): Promise<boolean> {
    const version = await getGVMversion();
    const correctVersion = (version.major > 22 || version.major === 22 && version.minor > 2);
    return correctVersion && (isJobReport() || isPrReport());
}

export function isJobReport(): boolean {
    return core.getBooleanInput(c.INPUT_NI_REPORT_JOB);
}
export function isPrReport(): boolean {
    return core.getBooleanInput(c.INPUT_NI_REPORT_PR);
}

export async function isNativeImageArtifactReport(): Promise<boolean> {
    const version = await getGVMversion();
    const correctVersion = (version.major > 20 || version.major === 20 && version.minor > 2);
    return correctVersion && isArtReport();
}

export function isArtReport():boolean{
    return false;//core.getBooleanInput(c.INPUT_NI_REPORT_ARTIFACT);
}