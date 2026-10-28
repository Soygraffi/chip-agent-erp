import ExcelJS from 'exceljs';
import { bizError, round2 } from '@erp/shared';
import type { DatabaseSync } from 'node:sqlite';
import type { ImportReport } from '@erp/shared';
import {
  customerService,
  dictService,
  getAllOrderNos,
  getOrderNoConfig,
  getRate,
  listOrders,
  orderService,
  statusDictService,
  type OrderFilter,
} from '@erp/db';
import {
  parseBool,
  validateCustomerRow,
  validateOrderRow,
  nextOrderNo,
  normalizeName,
  type ImportDicts,
} from '@erp/domain';

/* ---------------- 模板（PRD 4.5.1） ---------------- */

const CUSTOMER_HEADERS = [
  '客户全称*',
  '客户类型*',
  '联系人*',
  '联系电话*',
  '客户简称',
  '邮箱',
  '地址',
  '合作起始日期(YYYY-MM-DD)',
  '备注',
];
const ORDER_HEADERS = [
  '订单编号(留空自动生成)',
  '客户全称*',
  '订单日期(YYYY-MM-DD)*',
  '订单类型*',
  '订单状态*',
  '币种(留空=人民币)',
  '总金额(留空=自动汇总)',
  '预计交货日期(YYYY-MM-DD)',
  '负责人',
  '是否重点跟进(是/否)',
  '备注',
];

function styleHeaderRow(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
  });
}

function buildTemplate(headers: string[], example: (string | number | null)[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('导入模板');
  ws.addRow(headers);
  ws.addRow(example);
  ws.columns.forEach((c, i) => {
    c.width = Math.max(10, (headers[i] ?? '').length + 8);
  });
  styleHeaderRow(ws);
  return wb;
}

export async function customerTemplate(): Promise<Buffer> {
  const wb = buildTemplate(CUSTOMER_HEADERS, [
    '示例电子有限公司',
    '终端',
    '张三',
    '13800000000',
    '示例电子',
    'a@example.com',
    '深圳市',
    '2026-01-01',
    '示例行，导入前请删除',
  ]);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function orderTemplate(db: DatabaseSync): Promise<Buffer> {
  const types = dictService.list(db, 'order_type').map((d) => d.name).join('/');
  const statuses = statusDictService.list(db).map((s) => s.name).join('/');
  const wb = buildTemplate(ORDER_HEADERS, [
    '',
    '示例电子有限公司',
    '2026-10-28',
    types || '批量订单',
    statuses || '进行中',
    '',
    '',
    '2026-11-30',
    '',
    '否',
    '示例行，导入前请删除',
  ]);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

/* ---------------- 导入（PRD 4.5.1） ---------------- */

export interface ParsedCustomerRow {
  row: number;
  name: string | null;
  type: string | null;
  contact: string | null;
  phone: string | null;
  shortName: string | null;
  email: string | null;
  address: string | null;
  cooperationStart: string | null;
  remark: string | null;
}

export interface ParsedOrderRow {
  row: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  type: string | null;
  status: string | null;
  currency: string | null;
  amount: string | null;
  expectedDeliveryDate: string | null;
  owner: string | null;
  isKey: string | null;
  remark: string | null;
}

async function parseRows(buf: Buffer<ArrayBufferLike>): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as never);
  } catch {
    throw bizError('VALIDATION', '无法解析 Excel 文件（仅支持 .xlsx）');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw bizError('VALIDATION', 'Excel 文件没有工作表');
  const rows: string[][] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return; // 跳过表头
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v == null) vals.push('');
      else if (v instanceof Date) vals.push(v.toISOString().slice(0, 10));
      else if (typeof v === 'object' && 'text' in v) vals.push(String((v as { text: unknown }).text));
      else if (typeof v === 'object' && 'result' in v) vals.push(String((v as { result: unknown }).result));
      else if (typeof v === 'object' && 'richText' in v)
        vals.push(
          String(
            (v as { richText: unknown[] }).richText
              .map((t) => (t as { text: string }).text)
              .join(''),
          ),
        );
      else vals.push(String(v));
    });
    if (vals.some((x) => x.trim() !== '')) rows.push(vals);
  });
  return rows;
}

function toCell(v: string | undefined): string | null {
  return v && v.trim() !== '' ? v.trim() : null;
}

export function parseCustomerRows(raw: string[][]): ParsedCustomerRow[] {
  return raw.map((r, i) => ({
    row: i + 2,
    name: toCell(r[0]),
    type: toCell(r[1]),
    contact: toCell(r[2]),
    phone: toCell(r[3]),
    shortName: toCell(r[4]),
    email: toCell(r[5]),
    address: toCell(r[6]),
    cooperationStart: toCell(r[7]),
    remark: toCell(r[8]),
  }));
}

export function parseOrderRows(raw: string[][]): ParsedOrderRow[] {
  return raw.map((r, i) => ({
    row: i + 2,
    orderNo: toCell(r[0]),
    customerName: toCell(r[1]),
    orderDate: toCell(r[2]),
    type: toCell(r[3]),
    status: toCell(r[4]),
    currency: toCell(r[5]),
    amount: toCell(r[6]),
    expectedDeliveryDate: toCell(r[7]),
    owner: toCell(r[8]),
    isKey: toCell(r[9]),
    remark: toCell(r[10]),
  }));
}

function buildDicts(db: DatabaseSync): ImportDicts {
  return {
    customerTypeNames: new Set(dictService.list(db, 'customer_type').map((d) => d.name)),
    orderTypeNames: new Set(dictService.list(db, 'order_type').map((d) => d.name)),
    statusNames: new Set(statusDictService.list(db).map((s) => s.name)),
    currencyNames: new Set(dictService.list(db, 'currency').map((d) => d.name)),
  };
}

/** 导入客户：行级失败、重复跳过、报告成功/失败与原因 */
export async function importCustomers(db: DatabaseSync, buf: Buffer): Promise<ImportReport> {
  const rows = parseCustomerRows(await parseRows(buf));
  const dicts = buildDicts(db);
  const seen = customerService.existingNorms(db);
  const typeIds = new Map(dictService.list(db, 'customer_type').map((d) => [d.name, d.id]));
  const report: ImportReport = { successCount: 0, failCount: 0, failures: [] };

  db.exec('BEGIN');
  try {
    const stmt = db.prepare(
      'INSERT INTO customer (name, name_norm, short_name, type_id, contact, phone, email, address, cooperation_start, remark) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of rows) {
      const err = validateCustomerRow(r, dicts, seen);
      if (err) {
        report.failCount += 1;
        report.failures.push({ row: r.row, reason: err });
        continue;
      }
      stmt.run(
        r.name!.trim(),
        normalizeName(r.name!),
        r.shortName,
        typeIds.get(r.type!) ?? null,
        r.contact!.trim(),
        r.phone!.trim(),
        r.email,
        r.address,
        r.cooperationStart,
        r.remark,
      );
      report.successCount += 1;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return report;
}

/** 导入订单：客户精确匹配、编号留空按规则生成、成功行自动生成 10 个标准节点 */
export async function importOrders(db: DatabaseSync, buf: Buffer): Promise<ImportReport> {
  const rows = parseOrderRows(await parseRows(buf));
  const dicts = buildDicts(db);
  const customerIndex = customerService.normIndex(db);
  const seenNos = new Set(getAllOrderNos(db));
  const statusIdByName = new Map(statusDictService.list(db).map((s) => [s.name, s.id]));
  const typeIdByName = new Map(dictService.list(db, 'order_type').map((d) => [d.name, d.id]));
  const currencyByName = new Map(dictService.list(db, 'currency').map((d) => [d.name, d.id]));
  const rateById = new Map(
    dictService.list(db, 'currency').map((d) => [d.id, getRate(db, d.id)?.rate ?? 1]),
  );
  const noConfig = getOrderNoConfig(db);
  const report: ImportReport = { successCount: 0, failCount: 0, failures: [] };

  db.exec('BEGIN');
  try {
    const ins = db.prepare(
      'INSERT INTO orders (order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, ' +
        'currency_id, exchange_rate, total_amount, amount_manual, owner, is_key, remark) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const templates = db
      .prepare('SELECT id, name FROM node_template WHERE enabled = 1 ORDER BY sort_order')
      .all() as { id: number; name: string }[];
    const nodeStmt = db.prepare(
      'INSERT INTO order_node (order_id, template_id, name, status, owner, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const r of rows) {
      const { error, customerId } = validateOrderRow(r, dicts, customerIndex, seenNos);
      if (error || customerId == null) {
        report.failCount += 1;
        report.failures.push({ row: r.row, reason: error ?? '客户不存在' });
        continue;
      }
      const statusId = statusIdByName.get(r.status!)!;
      const typeId = typeIdByName.get(r.type!) ?? null;
      const currencyId = r.currency ? (currencyByName.get(r.currency) ?? null) : null;
      const exchangeRate = currencyId != null ? (rateById.get(currencyId) ?? 1) : null;
      const amountManual = r.amount != null;
      const totalAmount = amountManual ? round2(Number(r.amount)) : 0;

      let orderNo: string;
      if (r.orderNo) {
        orderNo = r.orderNo;
      } else {
        orderNo = nextOrderNo(noConfig, new Date(), getAllOrderNos(db));
        seenNos.add(orderNo);
      }

      const res = ins.run(
        orderNo,
        customerId,
        r.orderDate!,
        typeId,
        statusId,
        r.expectedDeliveryDate,
        currencyId,
        exchangeRate,
        totalAmount,
        amountManual ? 1 : 0,
        r.owner,
        parseBool(r.isKey) ? 1 : 0,
        r.remark,
      );
      const orderId = Number(res.lastInsertRowid);
      templates.forEach((t, i) => nodeStmt.run(orderId, t.id, t.name, 'pending', r.owner, i + 1));
      report.successCount += 1;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return report;
}

/* ---------------- 导出（PRD 4.5.1） ---------------- */

function timeTag(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function exportFileName(kind: string): string {
  return `${kind}_${timeTag()}.xlsx`;
}

export async function exportCustomers(db: DatabaseSync): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('客户列表');
  const headers = [
    '客户全称', '客户简称', '客户类型', '联系人', '联系电话',
    '邮箱', '地址', '订单总数', '跟进中订单数', '重点客户',
  ];
  ws.addRow(headers);
  const page = customerService.list(db, { page: 1, pageSize: 100000 });
  page.rows.forEach((c) => {
    ws.addRow([
      c.name, c.shortName ?? '', c.typeName ?? '', c.contact, c.phone,
      c.email ?? '', c.address ?? '', c.orderCount, c.activeOrderCount, c.isKey ? '是' : '否',
    ]);
  });
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 8)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportOrders(db: DatabaseSync, filter: OrderFilter): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单列表');
  const headers = [
    '订单编号', '客户名称', '订单类型', '订单状态', '金额', '折人民币',
    '订单日期', '预计交期', '负责人', '重点跟进', '逾期天数',
  ];
  ws.addRow(headers);
  const page = listOrders(db, { ...filter, page: 1, pageSize: 100000 });
  page.rows.forEach((o) => {
    ws.addRow([
      o.orderNo,
      o.customerName + (o.customerDeleted ? '（已删除客户）' : ''),
      o.typeName ?? '', o.statusName, o.totalAmount ?? 0,
      round2((o.totalAmount ?? 0) * (o.exchangeRate ?? 1)),
      o.orderDate, o.expectedDeliveryDate ?? '', o.owner ?? '',
      o.isKey ? '是' : '否', o.daysOverdue,
    ]);
  });
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 8)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportItems(db: DatabaseSync): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单明细');
  const headers = ['订单编号', '客户名称', '芯片型号', '品牌', '封装规格', '数量', '单价', '小计', '客户料号'];
  ws.addRow(headers);
  const page = listOrders(db, {
    page: 1,
    pageSize: 100000,
    today: new Date().toISOString().slice(0, 10),
  });
  for (const o of page.rows) {
    const items = db
      .prepare('SELECT * FROM order_item WHERE order_id = ? ORDER BY sort_order')
      .all(o.id) as {
      chip_model: string;
      brand: string | null;
      package_spec: string | null;
      qty: number;
      unit_price: number | null;
      subtotal: number | null;
      customer_pn: string | null;
    }[];
    items.forEach((it) => {
      ws.addRow([
        o.orderNo, o.customerName, it.chip_model, it.brand ?? '', it.package_spec ?? '',
        it.qty, it.unit_price ?? '', it.subtotal ?? '', it.customer_pn ?? '',
      ]);
    });
  }
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 8)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportOrderDetail(db: DatabaseSync, id: number): Promise<Buffer> {
  const detail = orderService.get(db, id);
  const wb = new ExcelJS.Workbook();

  const wsInfo = wb.addWorksheet('订单信息');
  const c = db.prepare('SELECT name FROM customer WHERE id = ?').get(detail.customerId) as { name: string };
  const status = db.prepare('SELECT name FROM order_status WHERE id = ?').get(detail.statusId) as { name: string };
  const info: [string, unknown][] = [
    ['订单编号', detail.orderNo],
    ['客户名称', c.name],
    ['订单状态', status.name],
    ['订单日期', detail.orderDate],
    ['预计交货日期', detail.expectedDeliveryDate ?? ''],
    ['实际交货日期', detail.actualDeliveryDate ?? ''],
    ['订单总金额', detail.totalAmount ?? 0],
    ['负责人', detail.owner ?? ''],
    ['重点跟进', detail.isKey ? '是' : '否'],
    ['备注', detail.remark ?? ''],
  ];
  info.forEach(([k, v]) => wsInfo.addRow([k, v]));
  wsInfo.getColumn(2).width = 40;

  const wsItems = wb.addWorksheet('物料明细');
  const itemHeaders = ['芯片型号', '品牌', '封装规格', '数量', '单价', '小计', '客户料号'];
  wsItems.addRow(itemHeaders);
  detail.items.forEach((it) =>
    wsItems.addRow([it.chipModel, it.brand ?? '', it.packageSpec ?? '', it.qty, it.unitPrice ?? '', it.subtotal ?? '', it.customerPn ?? '']),
  );
  wsItems.columns.forEach((col, i) => (col.width = Math.max(10, (itemHeaders[i] ?? '').length + 8)));
  styleHeaderRow(wsItems);

  const wsNodes = wb.addWorksheet('进度节点');
  const nodeHeaders = ['节点名称', '状态', '计划完成时间', '实际完成时间', '负责人'];
  wsNodes.addRow(nodeHeaders);
  const labels: Record<string, string> = {
    pending: '未开始',
    in_progress: '进行中',
    done: '已完成',
    delayed: '异常延误',
  };
  detail.nodes.forEach((n) =>
    wsNodes.addRow([n.name, labels[n.status] ?? n.status, n.planTime ?? '', n.actualTime ?? '', n.owner ?? '']),
  );
  wsNodes.columns.forEach((col, i) => (col.width = Math.max(10, (nodeHeaders[i] ?? '').length + 8)));
  styleHeaderRow(wsNodes);

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
