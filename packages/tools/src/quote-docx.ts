import AdmZip from 'adm-zip';

/**
 * 生成 Word（.docx）报价单（V1.7）
 * 采用 OOXML 最小结构 + 表格，无需第三方 docx 库（用已有 adm-zip 打包）。
 */

export interface QuoteDocxItem {
  materialCode?: string | null;
  materialName?: string | null;
  chipModel: string;
  brand?: string | null;
  qty: number;
  unitPrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  subtotal?: number | null;
  remark?: string | null;
}

export interface QuoteDocxInput {
  companyName: string;
  customerName: string;
  orderNo?: string | null;
  items: QuoteDocxItem[];
  totalAmount: number;
  terms: string;
  footer: string;
  date?: string;
}

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function grossPrice(it: QuoteDocxItem): number {
  const p = it.unitPrice ?? 0;
  const rate = it.taxRate ?? 13;
  return it.priceTaxIncluded === false ? Math.round(p * (1 + rate / 100) * 10000) / 10000 : p;
}

interface RunOpts {
  bold?: boolean;
  size?: number; // half-points
  color?: string;
}

function run(text: string, opts: RunOpts = {}): string {
  const rPr = `<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="宋体" w:hAnsi="Arial"/>${
    opts.bold ? '<w:b/>' : ''
  }${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}<w:sz w:val="${opts.size ?? 21}"/><w:szCs w:val="${
    opts.size ?? 21
  }"/></w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(runs: string, opts: { align?: string; spacing?: number; before?: number; after?: number } = {}): string {
  const pPr = `<w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}<w:spacing w:line="${
    opts.spacing ?? 300
  }" w:lineRule="auto"${opts.before != null ? ` w:before="${opts.before}"` : ''}${
    opts.after != null ? ` w:after="${opts.after}"` : ''
  }/></w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function cell(
  content: string,
  opts: { width?: number; align?: string; bold?: boolean; size?: number; span?: number } = {},
): string {
  const tcPr = `<w:tcPr><w:tcW w:w="${opts.width ?? 1200}" w:type="dxa"/>${
    opts.span && opts.span > 1 ? `<w:gridSpan w:val="${opts.span}"/>` : ''
  }<w:vAlign w:val="center"/></w:tcPr>`;
  const para = paragraph(run(content, { bold: opts.bold, size: opts.size ?? 19 }), {
    align: opts.align,
    spacing: 260,
  });
  return `<w:tc>${tcPr}${para}</w:tc>`;
}

const BORDERS =
  '<w:tblBorders>' +
  '<w:top w:val="single" w:sz="4" w:color="000000"/>' +
  '<w:left w:val="single" w:sz="4" w:color="000000"/>' +
  '<w:bottom w:val="single" w:sz="4" w:color="000000"/>' +
  '<w:right w:val="single" w:sz="4" w:color="000000"/>' +
  '<w:insideH w:val="single" w:sz="4" w:color="808080"/>' +
  '<w:insideV w:val="single" w:sz="4" w:color="808080"/>' +
  '</w:tblBorders>';

function table(rows: string[]): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="11800" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${[
    1600, 1800, 2000, 1400, 900, 1200, 1300, 1600,
  ]
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

function row(cells: string[]): string {
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
}

function documentXml(input: QuoteDocxInput): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const headerCells = [
    '物料编码',
    '物料名称',
    '料号规格',
    '品牌',
    '需求数量',
    '含税单价（元）',
    '含税金额（元）',
    '备注',
  ].map((h, i) => {
    const widths = [1600, 1800, 2000, 1400, 900, 1200, 1300, 1600];
    return cell(h, { width: widths[i], align: 'center', bold: true, size: 19 });
  });

  const itemRows = input.items.map((it) => {
    const gross = grossPrice(it);
    const subtotal = it.subtotal != null ? it.subtotal : Math.round(it.qty * gross * 100) / 100;
    return row([
      cell(it.materialCode ?? '', { width: 1600, size: 19 }),
      cell(it.materialName ?? it.chipModel, { width: 1800, size: 19 }),
      cell(it.chipModel, { width: 2000, size: 19 }),
      cell(it.brand ?? '', { width: 1400, size: 19, align: 'center' }),
      cell(String(it.qty), { width: 900, size: 19, align: 'right' }),
      cell(money(gross), { width: 1200, size: 19, align: 'right' }),
      cell(money(subtotal), { width: 1300, size: 19, align: 'right' }),
      cell(it.remark ?? '', { width: 1600, size: 19 }),
    ]);
  });

  const totalRow = row([
    cell('合计（含税）', { width: 4000, bold: true, size: 20, span: 2 }),
    cell('', { width: 2000 }),
    cell('', { width: 1400 }),
    cell('', { width: 900 }),
    cell('', { width: 1200 }),
    cell(money(input.totalAmount), { width: 1300, bold: true, size: 20, align: 'right' }),
    cell('', { width: 1600 }),
  ]);

  const termLines = input.terms.split('\n').filter((l) => l.trim() !== '');
  const termRows = [
    row([
      cell('备注说明', { width: 1600, bold: true, size: 19, span: 1 }),
      cell(termLines[0] ?? '', { width: 10200, span: 7, size: 19 }),
    ]),
    ...termLines.slice(1).map((line) =>
      row([cell('', { width: 1600 }), cell(line, { width: 10200, span: 7, size: 19 })]),
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${paragraph(run(input.companyName, { bold: true, size: 44 }), { align: 'center', spacing: 480, after: 120 })}
${paragraph(run('报 价 单', { bold: true, size: 32 }), { align: 'center', spacing: 360, after: 240 })}
${paragraph(
  run(`客户：${input.customerName}　　订单编号：${input.orderNo || '（待定）'}　　报价日期：${date}`, {
    size: 17,
    color: '808080',
  }),
  { align: 'left', after: 120 },
)}
${table([row(headerCells), ...itemRows, totalRow, ...termRows])}
${paragraph(run('', { size: 12 }), { spacing: 200 })}
${paragraph(run(input.footer, { size: 19 }), { align: 'left', spacing: 300, before: 120 })}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="宋体" w:hAnsi="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** 生成 .docx 二进制内容 */
export function buildQuoteDocx(input: QuoteDocxInput): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(CONTENT_TYPES, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(ROOT_RELS, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml(input), 'utf8'));
  zip.addFile('word/styles.xml', Buffer.from(STYLES_XML, 'utf8'));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(DOC_RELS, 'utf8'));
  return (zip as unknown as { toBuffer: () => Buffer }).toBuffer();
}

export function quoteDocxFileName(customerName: string): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = customerName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '客户';
  return `报价单_${safe}_${stamp}.docx`;
}
