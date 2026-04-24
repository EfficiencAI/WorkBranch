declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer): Promise<PDFData>;
  export default pdfParse;
}

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface MammothOptions {
    path?: string;
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
  }

  export function extractRawText(options: MammothOptions): Promise<MammothResult>;
}

declare module 'xlsx' {
  interface WorkSheet {
    [key: string]: unknown;
  }

  interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }

  interface XLSXUtils {
    sheet_to_csv(sheet: WorkSheet): string;
    sheet_to_json(sheet: WorkSheet): unknown[];
  }

  function readFile(filename: string): WorkBook;
  const utils: XLSXUtils;
  export { readFile, utils };
}
