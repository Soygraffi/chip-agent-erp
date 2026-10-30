import AdmZip from 'adm-zip';

/**
 * 生成 Word（.docx）报价单（V1.9）
 * 版式对齐 PPT 模板《半导体元器件代理报价单模板A4横版3》：
 * A4 横版 · 公司抬头 · 报价信息栏 · 明细表 · 合计 + 大写 · 备注 · 签章。
 * V1.9：按填写内容动态显示栏目；未填写数量时不显示数量/金额/合计；
 * 未税价时表头/合计显示“不含税”；去掉公司盖章处。
 */

export interface QuoteDocxItem {
  materialCode?: string | null;
  materialName?: string | null;
  chipModel: string;
  brand?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  subtotal?: number | null;
  remark?: string | null;
}

export interface QuoteDocxInput {
  companyName: string;
  companyNameEn?: string;
  customerName?: string | null;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  date?: string | null;
  validityDays?: number | null;
  orderQty?: number | null;
  deliveryDate?: string | null;
  salesPerson?: string | null;
  salesPhone?: string | null;
  items: QuoteDocxItem[];
  totalAmount: number;
  notes: string[];
  footer?: string;
}

const EN_NAME = 'HUBEI CHANGJIANG OPTOELECTRONICS INFORMATION INDUSTRY SUPPLY CHAIN CO., LTD.';
const PAGE_W = 14114; // A4 横版可打印宽度（twips）

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 单行金额：报价单价已是所选口径（含税/不含税），金额 = 数量 × 单价 */
export function lineAmount(it: QuoteDocxItem): number {
  const qty = it.qty ?? 0;
  const p = it.unitPrice ?? 0;
  return Math.round(qty * p * 100) / 100;
}

/** 人民币金额转中文大写 */
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
  size?: number;
  color?: string;
}

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
    width: number;
    align?: string;
    bold?: boolean;
    size?: number;
    span?: number;
    shade?: string;
    valign?: string;
    color?: string;
  },
): string {
  const tcPr = `<w:tcPr><w:tcW w:w="${opts.width}" w:type="dxa"/>${
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

/** 按权重把列宽铺满可打印宽度 */
function fitWidths(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((PAGE_W * w) / sum));
  widths[widths.length - 1] += PAGE_W - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function infoLine(fields: { label: string; value?: string | null }[], before = 0): string {
  const items = fields.filter((f) => (f.value ?? '').trim() !== '');
  if (items.length === 0) return '';
  const runs = items
    .map((f, i) => `${i > 0 ? TAB : ''}${run(`${f.label}${f.value}`, { size: 20 })}`)
    .join('');
  const tabs = items
    .slice(1)
    .map((_, i) => ({ pos: Math.floor((PAGE_W * (i + 1)) / items.length), val: 'left' as const }));
  return tabParagraph(runs, tabs, { spacing: 300, before });
}

function documentXml(input: QuoteDocxInput): string {
  const companyEn = (input.companyNameEn || EN_NAME).toUpperCase();

  const header = `${tabParagraph(
    `${run(input.companyName, { bold: true, size: 34, color: '1F3864' })}${TAB}${run('报 价 单', {
      bold: true,
      size: 42,
      color: '1F3864',
    })}`,
    [{ pos: PAGE_W, val: 'right' }],
    { spacing: 320 },
  )}${tabParagraph(
    `${run(companyEn, { size: 16, color: '595959' })}${TAB}${run('QUOTATION', { size: 18, color: '595959' })}`,
    [{ pos: PAGE_W, val: 'right' }],
    { spacing: 260, bottomBorder: true },
  )}`;

  const dateLine = infoLine(
    [
      { label: '报价日期：', value: input.date ?? '' },
      {
        label: '报价有效期：',
        value:
          input.validityDays && input.validityDays > 0 ? `自报价之日起 ${input.validityDays} 天` : '',
      },
    ],
    80,
  );
  const customerLine = infoLine([
    { label: '客户单位全称：', value: input.customerName ?? '' },
    { label: '对接人：', value: input.contact ?? '' },
    { label: '联系电话：', value: input.phone ?? '' },
  ]);
  const addressLine = infoLine([{ label: '客户地址（选填）：', value: input.address ?? '' }]);
  const orderLine = infoLine([
    { label: '订单数量：', value: input.orderQty && input.orderQty > 0 ? String(input.orderQty) : '' },
    { label: '交期：', value: input.deliveryDate ?? '' },
  ]);

  // 动态列：有数量才显示数量/金额列；未税时表头写“不含税”
  const hasQty = input.items.some((it) => (it.qty ?? 0) > 0);
  const hasPrice = input.items.some((it) => (it.unitPrice ?? 0) > 0);
  const untaxed = input.items.length > 0 && input.items.every((it) => it.priceTaxIncluded === false);
  const priceLabel = untaxed ? '不含税单价（元）' : '含税单价（元）';
  const amountLabel = untaxed ? '不含税总额（元）' : '含税总额（元）';

  const columns: { title: string; weight: number; align?: string; value: (it: QuoteDocxItem) => string }[] = [
    { title: '物料编码', weight: 8.5, value: (it) => it.materialCode ?? '' },
    { title: '物料名称', weight: 8.5, value: (it) => it.materialName ?? it.chipModel },
    { title: '料号规格', weight: 22, value: (it) => it.chipModel },
    { title: '品牌', weight: 7, align: 'center', value: (it) => it.brand ?? '' },
  ];
  if (hasQty) {
    columns.push({
      title: '需求数量',
      weight: 6.5,
      align: 'right',
      value: (it) => ((it.qty ?? 0) > 0 ? String(it.qty) : ''),
    });
  }
  if (hasPrice) {
    columns.push({
      title: priceLabel,
      weight: 8,
      align: 'right',
      value: (it) => ((it.unitPrice ?? 0) > 0 ? money(it.unitPrice ?? 0) : ''),
    });
  }
  if (hasQty && hasPrice) {
    columns.push({
      title: amountLabel,
      weight: 9,
      align: 'right',
      value: (it) => ((it.qty ?? 0) > 0 ? money(lineAmount(it)) : ''),
    });
  }
  columns.push({ title: '交期 / 备注（选填）', weight: 14, value: (it) => it.remark ?? '' });

  const widths = fitWidths(columns.map((c) => c.weight));

  const headerCells = columns.map((c, i) =>
    cell(c.title, { width: widths[i], align: 'center', bold: true, size: 19, shade: 'D9E2F3' }),
  );

  const itemRows = input.items.map((it) =>
    row(
      columns.map((c, i) => cell(c.value(it), { width: widths[i], size: 19, align: c.align })),
      { height: 560 },
    ),
  );

  const detailTable = table(widths, [row(headerCells, { header: true, height: 640 }), ...itemRows]);

  const totalLabel = untaxed ? '合计（不含税总金额）' : '合计（含税总金额）';
  const computedTotal = hasQty
    ? Math.round(input.items.reduce((acc, it) => acc + lineAmount(it), 0) * 100) / 100
    : input.totalAmount;
  const totalWidths = fitWidths([79, 21]);
  const totalTable =
    hasQty && hasPrice
      ? table(totalWidths, [
          row([
            cell(totalLabel, { width: totalWidths[0], align: 'right', bold: true, size: 22 }),
            cell(`¥ ${money(computedTotal)}`, {
              width: totalWidths[1],
              align: 'right',
              bold: true,
              size: 26,
            }),
          ]),
          row([
            cell(`合计人民币（大写）：${rmbUppercase(computedTotal)}`, {
              width: PAGE_W,
              span: 2,
              size: 20,
            }),
          ]),
        ])
      : '';

  const notes = input.notes.filter((n) => n.trim() !== '');
  const notesBlock =
    notes.length === 0
      ? ''
      : `${paragraph(run('备注说明', { bold: true, size: 20 }), { spacing: 300, before: 120 })}${notes
          .map((line) => paragraph(run(line, { size: 18, color: '404040' }), { spacing: 280 }))
          .join('')}`;

  const signFields = [
    { label: '报价人：', value: input.salesPerson ?? '' },
    { label: '联系电话：', value: input.salesPhone ?? '' },
  ].filter((f) => (f.value ?? '').trim() !== '');
  const signLine =
    signFields.length === 0
      ? ''
      : tabParagraph(
          signFields
            .map((f, i) => `${i > 0 ? TAB : ''}${run(`${f.label}${f.value}`, { size: 20 })}`)
            .join(''),
          signFields.slice(1).map((_, i) => ({
            pos: Math.floor((PAGE_W * (i + 1)) / signFields.length),
            val: 'left' as const,
          })),
          { spacing: 360, before: 420 },
        );

  const footer = (input.footer ?? '').trim();
  const footerLine = footer
    ? paragraph(run(footer, { size: 17, color: '808080' }), { align: 'left', spacing: 260, before: 160 })
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${header}
${dateLine}
${customerLine}
${addressLine}
${orderLine}
${detailTable}
${totalTable}
${notesBlock}
${paragraph(run('', { size: 10 }), { spacing: 120 })}
${signLine}
${footerLine}
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

/** 报价单文件名：客户简称 + 报价单 + _ + 日期（2026.5.7 形式） */
export function quoteDocxFileName(customerShortName: string, date?: string | null): string {
  const d = date ? new Date(`${date}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const datePart = `${safeDate.getFullYear()}.${safeDate.getMonth() + 1}.${safeDate.getDate()}`;
  const safe = (customerShortName || '客户').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  return `${safe}报价单_${datePart}.docx`;
}
