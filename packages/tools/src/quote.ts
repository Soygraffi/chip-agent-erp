import ExcelJS from 'exceljs';
import type { DatabaseSync } from 'node:sqlite';
import { bizError } from '@erp/shared';
import { customerService, getSetting, orderService } from '@erp/db';

const QUOTE_HEADERS = [
  '物料编码',
  '物料名称',
  '料号规格',
  '品牌',
  '需求数量',
  '含税单价（元）',
  '含税金额（元）',
  '备注',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function quoteFileName(orderNo: string): string {
  return `报价单_${orderNo}_${stamp()}.xlsx`;
}

/**
 * 一键导出报价单（V1.3）：版式对齐用户提供的 Excel 报价单
 * 公司抬头 → 报价单标题 → 表头 → 明细行 → 合计（含税）→ 备注说明 → 页脚
 */
export async function exportQuote(db: DatabaseSync, orderId: number): Promise<Buffer> {
  const detail = orderService.get(db, orderId);
  const customer = customerService.get(db, detail.customerId);
  const company = (getSetting(db, 'company_name') || '　　　　').trim();
  const terms = (
    getSetting(db, 'quote_terms') ||
    '1、交货周期：具体交货时间以合同约定时间为准\n2、付款方式：票到月结30天付现'
  ).split('\n');
  const footer = getSetting(db, 'quote_footer') || '如果对上述条款有任何问题，请随时向我们垂询。';

  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  const ws = wb.addWorksheet('报价单');

  ws.columns = [
    { width: 16 }, // 物料编码
    { width: 18 }, // 物料名称
    { width: 20 }, // 料号规格
    { width: 14 }, // 品牌
    { width: 10 }, // 需求数量
    { width: 14 }, // 含税单价
    { width: 14 }, // 含税金额
    { width: 26 }, // 备注
  ];

  // 标题：公司名 + 报价单
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = company;
  titleCell.font = { size: 20, bold: true, color: { argb: 'FF1F3864' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:H2');
  const subCell = ws.getCell('A2');
  subCell.value = '报价单';
  subCell.font = { size: 16, bold: true };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26;

  // 表头
  const headerRow = ws.addRow(QUOTE_HEADERS);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // 明细行
  for (const it of detail.items) {
    const row = ws.addRow([
      it.materialCode ?? '',
      it.materialName ?? '',
      it.chipModel,
      it.brand ?? '',
      it.qty,
      it.priceTaxIncluded
        ? (it.unitPrice ?? 0)
        : Number(((it.unitPrice ?? 0) * (1 + (it.taxRate ?? 13) / 100)).toFixed(4)),
      it.subtotal ?? 0,
      it.remark ?? '',
    ]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.alignment = {
        horizontal: col === 5 ? 'right' : col === 6 || col === 7 ? 'right' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (col === 6 || col === 7) cell.numFmt = '0.00';
    });
  }

  // 合计（含税）
  const totalRow = ws.addRow(['合计（含税）', '', '', '', '', '', detail.totalAmount ?? 0, '']);
  totalRow.font = { bold: true };
  ws.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
  totalRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  ws.getCell(`G${totalRow.number}`).numFmt = '0.00';
  ws.getCell(`G${totalRow.number}`).alignment = { horizontal: 'right', vertical: 'middle' };

  // 备注说明
  const noteStart = ws.rowCount + 1;
  const noteRow = ws.addRow(['备注说明', terms[0] ?? '', '', '', '', '', '', '']);
  ws.mergeCells(`B${noteRow.number}:H${noteRow.number}`);
  noteRow.height = 20;
  for (let i = 1; i < terms.length; i++) {
    const r = ws.addRow(['', terms[i] ?? '', '', '', '', '', '', '']);
    ws.mergeCells(`B${r.number}:H${r.number}`);
    r.height = 20;
  }
  // 备注说明区域的边框（简洁起见只给文字加外框）
  ws.getCell(`A${noteStart}`).font = { bold: true };
  ws.getCell(`B${noteStart}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  // 页脚
  const footRow = ws.addRow([footer, '', '', '', '', '', '', '']);
  ws.mergeCells(`A${footRow.number}:H${footRow.number}`);
  footRow.height = 24;
  ws.getCell(`A${footRow.number}`).alignment = { horizontal: 'left', vertical: 'middle' };

  // 客户名与日期（放在页脚下方小字，便于追溯）
  const metaRow = ws.addRow([
    `客户：${customer.name}　　订单编号：${detail.orderNo}　　报价日期：${new Date().toISOString().slice(0, 10)}`,
    '', '', '', '', '', '', '',
  ]);
  ws.mergeCells(`A${metaRow.number}:H${metaRow.number}`);
  ws.getCell(`A${metaRow.number}`).font = { size: 9, color: { argb: 'FF808080' } };
  ws.getCell(`A${metaRow.number}`).alignment = { horizontal: 'left', vertical: 'middle' };

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

/** 报价单导出前置校验：订单必须存在 */
export function assertQuotable(db: DatabaseSync, orderId: number): void {
  if (!db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId)) {
    throw bizError('ORDER_NOT_FOUND', '订单不存在');
  }
}
