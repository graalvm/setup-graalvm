function open(tag: string): string {
    return '<' + tag + '>';
}
function close(tag: string): string {
    return open('/' + tag);
}
function app(...content: string[]): string {
    return content.join('\n');
}
function enclose(tag: string, content: string, attr?: string) {
    return app(
        open(tag + (attr ? ' ' + attr : '')),
        content,
        close(tag));
}

const DETAILS = 'details';
const OPEN_ATTR = 'open';
const SUMMARY = 'summary';
export function detail(summary: string, details: string, closed: boolean = true): string {
    return enclose(DETAILS, app(
        enclose(SUMMARY,
            summary,
            closed ? undefined : OPEN_ATTR)
        , details));
}

const TABLE = 'table';
const TR = 'tr';
const TH = 'th';
const TD = 'td';
const COLSPAN_ATTR = 'colspan=';
export type TableCell = { content: string, header?: boolean, span?: number };
export type TableRow = (TableCell | string)[];
function mark_cell(content: string, header: boolean = false, span?: number): string {
    return enclose(header ? TH : TD,
        content,
        span ? COLSPAN_ATTR + span : undefined);
}
function cell(cell: TableCell | string): string {
    if (typeof cell === 'string')
        return mark_cell(cell);
    return mark_cell(cell.content, cell.header, cell.span);
}
function row(row: TableRow) {
    return enclose(TR, row.map(cell).join('\n'));
}
export function makeHeaderRow(...names: string[]): TableRow {
    return names.map(n => { return { content: n, header: true } });
}
export function table(table: TableRow[]): string {
    return enclose(TABLE, table.map(row).join('\n'));
}

const CODE = "code";
const PRE = "pre";
const LANG_ATTR = "lang="
export enum LANG {
    MERMAID = "mermaid",
}
export function code(lang: LANG, code: string): string {
    return enclose(PRE, enclose(CODE, code), LANG_ATTR + lang);
}

export type MermaidPieData = { name: string, size: number };
export function mermaidPie(title: string, showData: boolean, ...data: MermaidPieData[]): string {
    return code(LANG.MERMAID, `pie ${showData ? "showData " : ""}title ${title}\n\t${data.map(v1 => "\"" + v1.name + "\":" + v1.size).join("\n\t")}`);
}

const BOLD = "b";
export function bold(input: string): string {
    return enclose(BOLD, input);
}