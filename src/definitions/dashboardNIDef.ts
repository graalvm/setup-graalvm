export const HEAP_SIZE = "heap-size";
export const CODE_SIZE = "code-size";
export const HEAP_BREAKDOWN = "heap-breakdown";
export const CODE_BREAKDOWN = "code-breakdown";
export const COUNT = "count";
export const NAME = "name";
export const SIZE = "size";
export const TOTAL = "total";

export type CodeSize = { [NAME]: string, [SIZE]: number };
export type HeapSize = { [NAME]: string, [SIZE]: number, [COUNT]: number };
export type DashboardDump = {
    [CODE_BREAKDOWN]: { [CODE_SIZE]: CodeSize[], [TOTAL]?: number },
    [HEAP_BREAKDOWN]: { [HEAP_SIZE]: HeapSize[], [TOTAL]?: number }
};