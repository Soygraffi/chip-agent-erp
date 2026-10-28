import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { validateCustomerRow, validateOrderRow, parseBool, type ImportDicts } from '@erp/domain';

const dicts: ImportDicts = {
  customerTypeNames: new Set(['终端', '方案商', '贸易商', '其他']),
  orderTypeNames: new Set(['样品单', '批量订单', '备货订单', '返单']),
  statusNames: new Set(['待确认', '进行中', '已发货', '已完结', '已取消']),
  currencyNames: new Set<string>(),
};

describe('客户导入行校验（V1.2：仅全称必填）', () => {
  it('客户全称必填', () => {
    const seen = new Set<string>();
    expect(validateCustomerRow({ row: 1, name: null }, dicts, seen)).toContain('客户全称不能为空');
    expect(validateCustomerRow({ row: 1, name: '  ' }, dicts, seen)).toContain('客户全称不能为空');
  });

  it('类型可选，但填了必须在字典中', () => {
    const seen = new Set<string>();
    expect(validateCustomerRow({ row: 2, name: 'A公司' }, dicts, seen)).toBeNull();
    expect(validateCustomerRow({ row: 2, name: 'B公司', type: '终端' }, dicts, seen)).toBeNull();
    expect(validateCustomerRow({ row: 3, name: 'C公司', type: '不存在类型' }, dicts, seen)).toContain('不存在');
  });

  it('合法行通过并登记归一化名称', () => {
    const seen = new Set<string>();
    expect(validateCustomerRow({ row: 3, name: 'ＡＢＣ 电子' }, dicts, seen)).toBeNull();
    expect(seen.has('abc 电子')).toBe(true);
  });

  it('与库中或同文件已有客户重复（含全角/大小写变体）被拦截', () => {
    const seen = new Set(['华强半导体']);
    const err = validateCustomerRow({ row: 4, name: ' 华强半导体 ' }, dicts, seen);
    expect(err).toContain('已存在');
  });
});

describe('订单导入行校验（V1.2：仅客户必填，其余可选）', () => {
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

  it('日期/类型/状态均可留空；填了才校验格式与字典', () => {
    const r = validateOrderRow({ ...okRow, orderDate: null, type: null, status: null }, dicts, customers, new Set());
    expect(r.error).toBeNull();
    expect(validateOrderRow({ ...okRow, orderDate: '2026/10/28' }, dicts, customers, new Set()).error).toContain('格式不正确');
    expect(validateOrderRow({ ...okRow, orderDate: '2026-02-30' }, dicts, customers, new Set()).error).toContain('格式不正确');
    expect(validateOrderRow({ ...okRow, type: '未知类型' }, dicts, customers, new Set()).error).toContain('不存在');
    expect(validateOrderRow({ ...okRow, status: '未知状态' }, dicts, customers, new Set()).error).toContain('不存在');
  });

  it('订单编号重复被拦截；留空允许（自动生成）', () => {
    const seen = new Set(['XS202610280005']);
    expect(validateOrderRow(okRow, dicts, customers, seen).error).toContain('已存在');
    expect(validateOrderRow({ ...okRow, orderNo: null }, dicts, customers, seen).error).toBeNull();
  });

  it('金额与预计交货日期格式校验', () => {
    expect(validateOrderRow({ ...okRow, amount: 'abc' }, dicts, customers, new Set()).error).toContain('金额');
    expect(validateOrderRow({ ...okRow, expectedDeliveryDate: '10/28/2026' }, dicts, customers, new Set()).error).toContain('预计交货日期');
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
