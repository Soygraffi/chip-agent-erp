/** 第三方包类型补充声明 */
declare module 'adm-zip' {
  class AdmZip {
    constructor(path?: string);
    addFile(name: string, data: Buffer): void;
    addLocalFolder(path: string, zipPath?: string): void;
    writeZip(path: string): void;
    getEntry(name: string): { getData(): Buffer } | null;
    getEntries(): { entryName: string; isDirectory: boolean; getData(): Buffer }[];
  }
  export = AdmZip;
}
