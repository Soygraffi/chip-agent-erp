import ExcelJS from 'exceljs';
import { bizError, round2 } from '@erp/shared';
import type { DatabaseSync } from 'node:sqlite';
import type { ImportReport } from '@erp/shared';
import {
  customerService,
  dictService,
  getAllOrderNos,
  getOrderNoConfig,
  listGroupsByOrder,
  listMembers,
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

/* ---------------- 模板（V1.2） ---------------- */

const CUSTOMER_HEADERS = ['客户全称*', '客户类型', '客户简称', '地址', '备注'];
const ORDER_HEADERS = [
  '订单编号(留空自动生成)',
  '客户全称*',
  '订单日期(YYYY-MM-DD)',
  '订单类型',
  '订单状态',
  '总金额(留空=自动汇总)',
  '预计交货日期(YYYY-MM-DD)',
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
    '示例电子',
    '深圳市',
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
    '2026-11-30',
    '否',
    '示例行，导入前请删除',
  ]);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

/* ---------------- 导入（PRD 4.5.1 / V1.2 可选字段） ---------------- */

export interface ParsedCustomerRow {
  row: number;
  name: string | null;
  type: string | null;
  shortName: string | null;
  address: string | null;
  remark: string | null;
}

export interface ParsedOrderRow {
  row: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  type: string | null;
  status: string | null;
  amount: string | null;
  expectedDeliveryDate: string | null;
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
    shortName: toCell(r[2]),
    address: toCell(r[3]),
    remark: toCell(r[4]),
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
    amount: toCell(r[5]),
    expectedDeliveryDate: toCell(r[6]),
    isKey: toCell(r[7]),
    remark: toCell(r[8]),
  }));
}

function buildDicts(db: DatabaseSync): ImportDicts {
  return {
    customerTypeNames: new Set(dictService.list(db, 'customer_type').map((d) => d.name)),
    orderTypeNames: new Set(dictService.list(db, 'order_type').map((d) => d.name)),
    statusNames: new Set(statusDictService.list(db).map((s) => s.name)),
    currencyNames: new Set<string>(),
  };
}

/** 导入客户：仅全称必填；重复跳过；报告成功/失败与原因 */
export async function importCustomers(db: DatabaseSync, buf: Buffer): Promise<ImportReport> {
  const rows = parseCustomerRows(await parseRows(buf));
  const dicts = buildDicts(db);
  const seen = customerService.existingNorms(db);
  const typeIds = new Map(dictService.list(db, 'customer_type').map((d) => [d.name, d.id]));
  const report: ImportReport = { successCount: 0, failCount: 0, failures: [] };

  db.exec('BEGIN');
  try {
    const stmt = db.prepare(
      'INSERT INTO customer (name, name_norm, short_name, type_id, address, remark) VALUES (?, ?, ?, ?, ?, ?)',
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
        typeIds.get(r.type ?? '') ?? null,
        r.address,
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

/** 导入订单：客户必须已存在；日期/类型/状态可选；成功行自动生成 10 个标准节点 */
export async function importOrders(db: DatabaseSync, buf: Buffer): Promise<ImportReport> {
  const rows = parseOrderRows(await parseRows(buf));
  const dicts = buildDicts(db);
  const customerIndex = customerService.normIndex(db);
  const seenNos = new Set(getAllOrderNos(db));
  const statusIdByName = new Map(statusDictService.list(db).map((s) => [s.name, s.id]));
  const typeIdByName = new Map(dictService.list(db, 'order_type').map((d) => [d.name, d.id]));
  const noConfig = getOrderNoConfig(db);
  const report: ImportReport = { successCount: 0, failCount: 0, failures: [] };

  db.exec('BEGIN');
  try {
    const ins = db.prepare(
      'INSERT INTO orders (order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, ' +
        'total_amount, amount_manual, is_key, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const templates = db
      .prepare('SELECT id, name FROM node_template WHERE enabled = 1 ORDER BY sort_order')
      .all() as { id: number; name: string }[];
    const nodeStmt = db.prepare(
      'INSERT INTO order_node (order_id, template_id, name, status, sort_order) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of rows) {
      const { error, customerId } = validateOrderRow(r, dicts, customerIndex, seenNos);
      if (error || customerId == null) {
        report.failCount += 1;
        report.failures.push({ row: r.row, reason: error ?? '客户不存在' });
        continue;
      }
      const statusId = r.status ? (statusIdByName.get(r.status) ?? null) : null;
      const typeId = r.type ? (typeIdByName.get(r.type) ?? null) : null;
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
        r.orderDate,
        typeId,
        statusId,
        r.expectedDeliveryDate,
        totalAmount,
        amountManual ? 1 : 0,
        parseBool(r.isKey) ? 1 : 0,
        r.remark,
      );
      const orderId = Number(res.lastInsertRowid);
      templates.forEach((t, i) => nodeStmt.run(orderId, t.id, t.name, 'pending', i + 1));
      report.successCount += 1;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return report;
}

/* ---------------- 导出（PRD 4.5.1 / V1.2） ---------------- */

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
  const headers = ['客户全称', '客户简称', '客户类型', '地址', '微信群数', '订单总数', '跟进中订单数', '重点客户'];
  ws.addRow(headers);
  const page = customerService.list(db, { page: 1, pageSize: 100000 });
  page.rows.forEach((c) => {
    ws.addRow([
      c.name,
      c.shortName ?? '',
      c.typeName ?? '',
      c.address ?? '',
      c.wechatGroupCount,
      c.orderCount,
      c.activeOrderCount,
      c.isKey ? '是' : '否',
    ]);
  });
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 8)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportOrders(db: DatabaseSync, filter: OrderFilter): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单列表');
  const headers = ['订单编号', '客户名称', '订单类型', '订单状态', '订单金额', '订单日期', '预计交期', '重点跟进', '逾期天数', '沟通微信群'];
  ws.addRow(headers);
  const page = listOrders(db, { ...filter, page: 1, pageSize: 100000 });
  page.rows.forEach((o) => {
    const groups = listGroupsByOrder(db, o.id)
      .map((g) => g.name)
      .join('、');
    ws.addRow([
      o.orderNo,
      o.customerName + (o.customerDeleted ? '（已删除客户）' : ''),
      o.typeName ?? '',
      o.statusName,
      o.totalAmount ?? 0,
      o.orderDate ?? '',
      o.expectedDeliveryDate ?? '',
      o.isKey ? '是' : '否',
      o.daysOverdue,
      groups,
    ]);
  });
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 8)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportItems(db: DatabaseSync): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('订单明细');
  const headers = ['订单编号', '客户名称', '物料编码', '物料名称', '料号规格', '品牌', '数量', '进货价', '出货价', '含税口径', '税率(%)', '含税单价', '含税金额', '毛利', '客户料号'];
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
      material_code: string | null;
      material_name: string | null;
      chip_model: string;
      brand: string | null;
      qty: number;
      unit_price: number | null;
      purchase_price: number | null;
      price_tax_included: number;
      tax_rate: number;
      subtotal: number | null;
      customer_pn: string | null;
    }[];
    items.forEach((it) => {
      const taxIncluded = it.price_tax_included === 1;
      const rate = it.tax_rate ?? 13;
      const grossPrice = taxIncluded
        ? (it.unit_price ?? 0)
        : Number(((it.unit_price ?? 0) * (1 + rate / 100)).toFixed(4));
      const grossPurchase = taxIncluded
        ? (it.purchase_price ?? 0)
        : Number(((it.purchase_price ?? 0) * (1 + rate / 100)).toFixed(4));
      ws.addRow([
        o.orderNo,
        o.customerName,
        it.material_code ?? '',
        it.material_name ?? '',
        it.chip_model,
        it.brand ?? '',
        it.qty,
        it.purchase_price ?? '',
        it.unit_price ?? '',
        taxIncluded ? '含税' : '不含税',
        rate,
        grossPrice,
        it.subtotal ?? 0,
        Number(((it.qty * (grossPrice - grossPurchase)) || 0).toFixed(2)),
        it.customer_pn ?? '',
      ]);
    });
  }
  ws.columns.forEach((col, i) => (col.width = Math.max(10, (headers[i] ?? '').length + 6)));
  styleHeaderRow(ws);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function exportOrderDetail(db: DatabaseSync, id: number): Promise<Buffer> {
  const detail = orderService.get(db, id);
  const wb = new ExcelJS.Workbook();

  const wsInfo = wb.addWorksheet('订单信息');
  const c = db.prepare('SELECT name FROM customer WHERE id = ?').get(detail.customerId) as { name: string };
  const status =
    detail.statusId != null
      ? (db.prepare('SELECT name FROM order_status WHERE id = ?').get(detail.statusId) as { name: string })
      : null;
  const text = (v: string | null): string => (v && v.trim() !== '' ? v : '未填写');
  const info: [string, unknown][] = [
    ['订单编号', detail.orderNo],
    ['客户名称', c.name],
    ['订单状态', status?.name ?? '未填写'],
    ['订单日期', text(detail.orderDate)],
    ['预计交货日期', text(detail.expectedDeliveryDate)],
    ['实际交货日期', text(detail.actualDeliveryDate)],
    ['订单总金额', detail.totalAmount ?? 0],
    ['重点跟进', detail.isKey ? '是' : '否'],
    ['沟通微信群', detail.wechatGroups.map((g) => g.name).join('、')],
    ['备注', text(detail.remark)],
  ];
  info.forEach(([k, v]) => wsInfo.addRow([k, v]));
  wsInfo.getColumn(2).width = 40;

  const wsItems = wb.addWorksheet('物料明细');
  const itemHeaders = ['物料编码', '物料名称', '料号规格', '品牌', '数量', '进货价', '出货价', '含税口径', '含税金额', '备注'];
  wsItems.addRow(itemHeaders);
  detail.items.forEach((it) =>
    wsItems.addRow([
      it.materialCode ?? '',
      it.materialName ?? '',
      it.chipModel,
      it.brand ?? '',
      it.qty,
      it.purchasePrice ?? '',
      it.unitPrice ?? '',
      it.priceTaxIncluded ? '含税' : '不含税',
      it.subtotal ?? 0,
      it.remark ?? '',
    ]),
  );
  wsItems.columns.forEach((col, i) => (col.width = Math.max(10, (itemHeaders[i] ?? '').length + 8)));
  styleHeaderRow(wsItems);

  const wsNodes = wb.addWorksheet('进度节点');
  const nodeHeaders = ['节点名称', '状态', '计划完成时间', '实际完成时间'];
  wsNodes.addRow(nodeHeaders);
  const labels: Record<string, string> = {
    pending: '未开始',
    in_progress: '进行中',
    done: '已完成',
    delayed: '异常延误',
  };
  detail.nodes.forEach((n) =>
    wsNodes.addRow([n.name, labels[n.status] ?? n.status, n.planTime ?? '', n.actualTime ?? '']),
  );
  wsNodes.columns.forEach((col, i) => (col.width = Math.max(10, (nodeHeaders[i] ?? '').length + 8)));
  styleHeaderRow(wsNodes);

  const wsGroups = wb.addWorksheet('沟通微信群');
  const groupHeaders = ['微信群', '群备注', '微信号', '真实姓名', '岗位'];
  wsGroups.addRow(groupHeaders);
  for (const g of detail.wechatGroups) {
    const members = listMembers(db, g.id);
    if (members.length === 0) {
      wsGroups.addRow([g.name, g.remark ?? '', '', '', '']);
    }
    members.forEach((m) => {
      wsGroups.addRow([g.name, g.remark ?? '', m.wechatId, m.realName ?? '', m.position ?? '']);
    });
  }
  wsGroups.columns.forEach((col, i) => (col.width = Math.max(10, (groupHeaders[i] ?? '').length + 8)));
  styleHeaderRow(wsGroups);

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
