import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { validateCustomerRow, validateOrderRow, parseBool, type ImportDicts } from '@erp/domain';

const dicts: ImportDicts = {
  customerTypeNames: new Set(['终端', '方案商', '贸易商', '其他']),
  orderTypeNames: new Set(['样品单', '批量订单', '备货订单', '返单']),
  statusNames: new Set(['待确认', '进行中', '已发货', '已完结', '已取消']),
  currencyNames: new Set(['人民币 CNY', '美元 USD']),
};

describe('客户导入行校验', () => {
  it('必填项缺失逐项报错', () => {
    const seen = new Set<string>();
    expect(validateCustomerRow({ row: 1, name: null }, dicts, seen)).toContain('客户全称不能为空');
    expect(validateCustomerRow({ row: 1, name: 'A公司' }, dicts, seen)).toContain('客户类型不能为空');
    expect(validateCustomerRow({ row: 1, name: 'A公司', type: '终端' }, dicts, seen)).toContain('联系人不能为空');
    expect(
      validateCustomerRow({ row: 1, name: 'A公司', type: '终端', contact: '张三' }, dicts, seen),
    ).toContain('联系电话不能为空');
  });

  it('类型必须存在于字典', () => {
    const seen = new Set<string>();
    const err = validateCustomerRow(
      { row: 2, name: 'A公司', type: '不存在类型', contact: '张三', phone: '13800000000' },
      dicts,
      seen,
    );
    expect(err).toContain('不存在');
  });

  it('合法行通过并登记归一化名称', () => {
    const seen = new Set<string>();
    expect(
      validateCustomerRow({ row: 3, name: 'ＡＢＣ 电子', type: '终端', contact: '李四', phone: '13800000000' }, dicts, seen),
    ).toBeNull();
    expect(seen.has('abc 电子')).toBe(true);
  });

  it('与库中或同文件已有客户重复（含全角/大小写变体）被拦截', () => {
    const seen = new Set(['华强半导体']);
    const err = validateCustomerRow(
      { row: 4, name: ' 华强半导体 ', type: '终端', contact: '王五', phone: '13800000000' },
      dicts,
      seen,
    );
    expect(err).toContain('已存在');
  });
});

describe('订单导入行校验', () => {
  const customers = new Map<string, number>([['华强半导体', 7]]);
  const okRow = {
    row: 5,
    orderNo: 'XS202610280005',
    customerName: '华强半导体',
    orderDate: '2026-10-28',
    type: '批量订单',
    status: '进行中',
  };

  it('客户必须已存在（按归一化全称精确匹配）', () => {
    const { error } = validateOrderRow(
      { ...okRow, customerName: '不存在的客户' },
      dicts,
      customers,
      new Set(),
    );
    expect(error).toContain('不存在');
    // 全角/大小写变体也能匹配到同一客户
    const r2 = validateOrderRow({ ...okRow, customerName: ' 华强半导体' }, dicts, customers, new Set());
    expect(r2.error).toBeNull();
    expect(r2.customerId).toBe(7);
  });

  it('订单日期必填且格式正确', () => {
    const { error } = validateOrderRow({ ...okRow, orderDate: null }, dicts, customers, new Set());
    expect(error).toContain('订单日期不能为空');
    const r2 = validateOrderRow({ ...okRow, orderDate: '2026/10/28' }, dicts, customers, new Set());
    expect(r2.error).toContain('格式不正确');
    const r3 = validateOrderRow({ ...okRow, orderDate: '2026-02-30' }, dicts, customers, new Set());
    expect(r3.error).toContain('格式不正确');
  });

  it('类型/状态/币种必须存在于字典；币种可留空（默认人民币由服务层处理）', () => {
    const r1 = validateOrderRow({ ...okRow, type: '未知类型' }, dicts, customers, new Set());
    expect(r1.error).toContain('不存在');
    const r2 = validateOrderRow({ ...okRow, status: '未知状态' }, dicts, customers, new Set());
    expect(r2.error).toContain('不存在');
    const r3 = validateOrderRow({ ...okRow, currency: '日元' }, dicts, customers, new Set());
    expect(r3.error).toContain('不存在');
    const r4 = validateOrderRow({ ...okRow, currency: null }, dicts, customers, new Set());
    expect(r4.error).toBeNull();
  });

  it('订单编号重复被拦截；留空允许（自动生成）', () => {
    const seen = new Set(['XS202610280005']);
    const r1 = validateOrderRow(okRow, dicts, customers, seen);
    expect(r1.error).toContain('已存在');
    const r2 = validateOrderRow({ ...okRow, orderNo: null }, dicts, customers, seen);
    expect(r2.error).toBeNull();
  });

  it('金额与预计交货日期格式校验', () => {
    const r1 = validateOrderRow({ ...okRow, amount: 'abc' }, dicts, customers, new Set());
    expect(r1.error).toContain('金额');
    const r2 = validateOrderRow({ ...okRow, expectedDeliveryDate: '10/28/2026' }, dicts, customers, new Set());
    expect(r2.error).toContain('预计交货日期');
  });

  it('合法行通过并返回客户ID', () => {
    const r = validateOrderRow(okRow, dicts, customers, new Set());
    expect(r.error).toBeNull();
    expect(r.customerId).toBe(7);
  });
});

describe('parseBool', () => {
  it('支持 是/否/true/false/1/0 及布尔值', () => {
    expect(parseBool('是')).toBe(true);
    expect(parseBool('否')).toBe(false);
    expect(parseBool('TRUE')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('0')).toBe(false);
    expect(parseBool(true)).toBe(true);
    expect(parseBool(null)).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});
