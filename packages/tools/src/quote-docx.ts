import AdmZip from 'adm-zip';

/**
 * 生成 Word（.docx）报价单（V1.7.2）
 * 版式对齐 PPT 模板《半导体元器件代理报价单模板A4横版3》：
 * A4 横版 · 公司抬头（中/英）· 报价单/QUOTATION · 报价信息栏 · 8 列明细表 ·
 * 合计（含税总金额）+ 大写 · 备注说明 · 报价人/电话/盖章处。
 * 采用 OOXML 最小结构 + 表格，无需第三方 docx 库（用 adm-zip 打包）。
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
  customerContact?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  salesPerson?: string | null;
  salesPhone?: string | null;
  validityDays?: number;
  companyNameEn?: string;
}

const EN_NAME = 'HUBEI CHANGJIANG OPTOELECTRONICS INFORMATION INDUSTRY SUPPLY CHAIN CO., LTD.';

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

/** 人民币金额转中文大写（支持到亿，保留分；角分整时补“整”） */
export function rmbUppercase(amount: number): string {
  const digits = '零壹贰叁肆伍陆柒捌玖';
  const bigUnits = ['', '拾', '佰', '仟'];
  const groups = ['', '万', '亿', '万亿'];
  const cents = Math.round(Math.abs(amount) * 100);
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;

  const groupToChinese = (n: number): string => {
    let s = '';
    let zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(n / Math.pow(10, i)) % 10;
      if (d === 0) {
        if (s !== '') zero = true;
      } else {
        if (zero) {
          s += '零';
          zero = false;
        }
        s += digits[d] + bigUnits[i];
      }
    }
    return s;
  };

  let yuanStr = '';
  if (yuan === 0) {
    yuanStr = '零';
  } else {
    const parts: string[] = [];
    let rest = yuan;
    let gi = 0;
    while (rest > 0 && gi < groups.length) {
      const g = rest % 10000;
      if (g !== 0) {
        parts.unshift(groupToChinese(g) + groups[gi]);
      } else if (parts.length > 0 && !parts[0].startsWith('零')) {
        parts.unshift('零');
      }
      rest = Math.floor(rest / 10000);
      gi++;
    }
    yuanStr = parts.join('').replace(/零+/g, '零').replace(/零$/, '');
  }

  let out = `${yuanStr}元`;
  if (jiao === 0 && fen === 0) return out + '整';
  if (jiao > 0) {
    out += `${digits[jiao]}角`;
    if (fen === 0) return out + '整';
  } else {
    out += '零';
  }
  if (fen > 0) out += `${digits[fen]}分`;
  return out;
}

/* ---------------- OOXML helpers ---------------- */

interface RunOpts {
  bold?: boolean;
  size?: number; // half-points
  color?: string;
}

/** 制表符必须放在 run 内，否则 Word 忽略 */
const TAB = '<w:r><w:tab/></w:r>';

function run(text: string, opts: RunOpts = {}): string {
  const rPr = `<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="宋体" w:hAnsi="Arial"/>${
    opts.bold ? '<w:b/>' : ''
  }${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}<w:sz w:val="${opts.size ?? 21}"/><w:szCs w:val="${
    opts.size ?? 21
  }"/></w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(
  runs: string,
  opts: { align?: string; spacing?: number; before?: number; after?: number; bottomBorder?: boolean } = {},
): string {
  const pPr = `<w:pPr>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ''}<w:spacing w:line="${
    opts.spacing ?? 276
  }" w:lineRule="auto"${opts.before != null ? ` w:before="${opts.before}"` : ''}${
    opts.after != null ? ` w:after="${opts.after}"` : ''
  }/>${
    opts.bottomBorder ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:color="1F3864"/></w:pBdr>' : ''
  }</w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

/** 带制表位的段落（页眉/信息栏/签章，避免表格线） */
function tabParagraph(
  runs: string,
  tabs: { pos: number; val?: 'left' | 'right' | 'center' }[],
  opts: { spacing?: number; before?: number; after?: number; bottomBorder?: boolean } = {},
): string {
  const tabXml = tabs.map((t) => `<w:tab w:val="${t.val ?? 'left'}" w:pos="${t.pos}"/>`).join('');
  const pPr = `<w:pPr>${tabs.length > 0 ? `<w:tabs>${tabXml}</w:tabs>` : ''}<w:spacing w:line="${
    opts.spacing ?? 300
  }" w:lineRule="auto"${opts.before != null ? ` w:before="${opts.before}"` : ''}${
    opts.after != null ? ` w:after="${opts.after}"` : ''
  }/>${
    opts.bottomBorder ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:color="1F3864"/></w:pBdr>' : ''
  }</w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function cell(
  content: string,
  opts: {
    width?: number;
    align?: string;
    bold?: boolean;
    size?: number;
    span?: number;
    shade?: string;
    valign?: string;
    color?: string;
  } = {},
): string {
  const tcPr = `<w:tcPr><w:tcW w:w="${opts.width ?? 1200}" w:type="dxa"/>${
    opts.span && opts.span > 1 ? `<w:gridSpan w:val="${opts.span}"/>` : ''
  }${opts.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>` : ''}<w:vAlign w:val="${
    opts.valign ?? 'center'
  }"/></w:tcPr>`;
  const para = paragraph(run(content, { bold: opts.bold, size: opts.size ?? 19, color: opts.color }), {
    align: opts.align,
    spacing: 250,
  });
  return `<w:tc>${tcPr}${para}</w:tc>`;
}

const BORDER_SINGLE =
  '<w:tblBorders>' +
  '<w:top w:val="single" w:sz="6" w:color="404040"/>' +
  '<w:left w:val="single" w:sz="6" w:color="404040"/>' +
  '<w:bottom w:val="single" w:sz="6" w:color="404040"/>' +
  '<w:right w:val="single" w:sz="6" w:color="404040"/>' +
  '<w:insideH w:val="single" w:sz="4" w:color="808080"/>' +
  '<w:insideV w:val="single" w:sz="4" w:color="808080"/>' +
  '</w:tblBorders>';

function table(grid: number[], rows: string[]): string {
  const total = grid.reduce((a, b) => a + b, 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${BORDER_SINGLE}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

function row(cells: string[], opts: { header?: boolean; height?: number } = {}): string {
  return `<w:tr><w:trPr>${opts.header ? '<w:tblHeader/>' : ''}<w:cantSplit/>${
    opts.height ? `<w:trHeight w:val="${opts.height}" w:hRule="atLeast"/>` : ''
  }</w:trPr>${cells.join('')}</w:tr>`;
}

const COL_W = [1570, 1505, 3985, 1240, 1175, 1405, 1665, 2613]; // 合计 15158 twips ≈ 26.7cm

function documentXml(input: QuoteDocxInput): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const validity = input.validityDays ?? 30;
  const companyEn = (input.companyNameEn || EN_NAME).toUpperCase();

  const header = `${tabParagraph(
    `${run(input.companyName, { bold: true, size: 34, color: '1F3864' })}${TAB}${run('报 价 单', {
      bold: true,
      size: 42,
      color: '1F3864',
    })}`,
    [{ pos: 15158, val: 'right' }],
    { spacing: 320 },
  )}${tabParagraph(
    `${run(companyEn, { size: 16, color: '595959' })}${TAB}${run('QUOTATION', { size: 18, color: '595959' })}`,
    [{ pos: 15158, val: 'right' }],
    { spacing: 260, bottomBorder: true },
  )}`;

  const info1Line = tabParagraph(
    `${run(`报价日期：${date}`, { size: 20 })}${TAB}${run(`报价有效期：自报价之日起 ${validity} 天`, {
      size: 20,
    })}`,
    [{ pos: 7000, val: 'left' }],
    { spacing: 300, before: 80 },
  );
  const info2Line = tabParagraph(
    `${run(`客户单位全称：${input.customerName}`, { size: 19 })}${TAB}${run(
      `对接人：${input.customerContact ?? ''}`,
      { size: 19 },
    )}${TAB}${run(`联系电话：${input.customerPhone ?? ''}`, { size: 19 })}`,
    [
      { pos: 6800, val: 'left' },
      { pos: 9800, val: 'left' },
    ],
    { spacing: 300 },
  );
  const info3Line = tabParagraph(
    `${run(`客户地址（选填）：${input.customerAddress ?? ''}`, { size: 19 })}`,
    [],
    { spacing: 280 },
  );

  const headerCells = [
    '物料编码',
    '物料名称',
    '料号规格',
    '品牌',
    '需求数量',
    '含税单价（元）',
    '含税总额（元）',
    '交期 / 备注（选填）',
  ].map((h, i) =>
    cell(h, { width: COL_W[i], align: 'center', bold: true, size: 19, shade: 'D9E2F3' }),
  );

  const itemRows = input.items.map((it) => {
    const gross = grossPrice(it);
    const subtotal = it.subtotal != null ? it.subtotal : Math.round(it.qty * gross * 100) / 100;
    return row(
      [
        cell(it.materialCode ?? '', { width: COL_W[0], size: 19 }),
        cell(it.materialName ?? it.chipModel, { width: COL_W[1], size: 19 }),
        cell(it.chipModel, { width: COL_W[2], size: 19 }),
        cell(it.brand ?? '', { width: COL_W[3], size: 19, align: 'center' }),
        cell(String(it.qty), { width: COL_W[4], size: 19, align: 'right' }),
        cell(money(gross), { width: COL_W[5], size: 19, align: 'right' }),
        cell(money(subtotal), { width: COL_W[6], size: 19, align: 'right' }),
        cell(it.remark ?? '', { width: COL_W[7], size: 19 }),
      ],
      { height: 560 },
    );
  });

  const detailTable = table(COL_W, [row(headerCells, { header: true, height: 640 }), ...itemRows]);

  const totalTable = table(
    [12000, 3158],
    [
      row([
        cell('合计（含税总金额）', { width: 12000, align: 'right', bold: true, size: 22 }),
        cell(`¥ ${money(input.totalAmount)}`, { width: 3158, align: 'right', bold: true, size: 26 }),
      ]),
      row([
        cell(`合计人民币（大写）：${rmbUppercase(input.totalAmount)}`, {
          width: 15158,
          span: 2,
          size: 20,
        }),
      ]),
    ],
  );

  const termLines = input.terms.split('\n').filter((l) => l.trim() !== '');
  const noteTitle = paragraph(run('备注说明', { bold: true, size: 20 }), { spacing: 300, before: 120 });
  const noteLines = termLines.map((line) =>
    paragraph(run(line, { size: 18, color: '404040' }), { spacing: 280 }),
  );

  const signLine = tabParagraph(
    `${run(`报价人：${input.salesPerson ?? '____________'}`, { size: 20 })}${TAB}${run(
      `联系电话：${input.salesPhone ?? '____________'}`,
      { size: 20 },
    )}${TAB}${run('（公司盖章处）', { size: 20, color: '808080' })}`,
    [
      { pos: 7500, val: 'left' },
      { pos: 15158, val: 'right' },
    ],
    { spacing: 360, before: 420 },
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${header}
${info1Line}
${info2Line}
${info3Line}
${detailTable}
${totalTable}
${noteTitle}
${noteLines.join('')}
${paragraph(run('', { size: 10 }), { spacing: 120 })}
${signLine}
${paragraph(run(input.footer, { size: 17, color: '808080' }), { align: 'left', spacing: 260, before: 160 })}
<w:sectPr>
  <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
  <w:pgMar w:top="850" w:right="1360" w:bottom="850" w:left="1360" w:header="425" w:footer="500" w:gutter="0"/>
</w:sectPr>
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
