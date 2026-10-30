import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import AdmZip from 'adm-zip';
import { buildQuoteDocx, quoteDocxFileName, rmbUppercase, lineAmount } from '@erp/tools';

const input = {
  companyName: '湖北长江光电子信息产业供应链有限公司',
  customerName: '长沙丹芬瑞电气技术有限公司',
  contact: '张工',
  phone: '13800000000',
  address: '长沙市岳麓区xx路xx号',
  date: '2026-05-07',
  validityDays: 30,
  orderQty: 10,
  deliveryDate: '2026-06-01',
  salesPerson: '李经理',
  salesPhone: '13900000000',
  items: [
    {
      materialCode: 'RDDZX03001',
      materialName: 'ARM处理器',
      chipModel: 'GD32F407ZGT6',
      brand: '兆易创新',
      qty: 5,
      unitPrice: 29.24,
      priceTaxIncluded: true,
      taxRate: 13,
      subtotal: 146.2,
      remark: '现货',
    },
    {
      materialCode: 'RDDZX03002',
      materialName: 'ARM处理器',
      chipModel: 'GD32F103ZET6',
      brand: '兆易创新',
      qty: 5,
      unitPrice: 14.94,
      priceTaxIncluded: true,
      taxRate: 13,
      subtotal: 74.7,
      remark: null,
    },
  ],
  totalAmount: 220.9,
  notes: ['1、交货周期：具体交货时间以合同约定时间为准', '2、付款方式：票到月结30天付现'],
  footer: '如果对上述条款有任何问题，请随时向我们垂询。',
};

function xmlOf(buf: Buffer): string {
  return new AdmZip(buf).getEntry('word/document.xml')!.getData().toString('utf8');
}

describe('Word 报价单（V1.9：动态列 / 含税口径 / 订单数量交期）', () => {
  it('生成合法 docx，A4 横版', () => {
    const buf = buildQuoteDocx(input);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const names = new AdmZip(buf)
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toContain('word/document.xml');
    expect(xmlOf(buf).includes('w:orient="landscape"')).toBe(true);
  });

  it('完整信息：抬头、客户、明细、合计、大写、备注、签章；没有盖章处', () => {
    const xml = xmlOf(buildQuoteDocx(input));
    expect(xml.includes('湖北长江光电子信息产业供应链有限公司')).toBe(true);
    expect(xml.includes('长沙丹芬瑞电气技术有限公司')).toBe(true);
    expect(xml.includes('张工')).toBe(true);
    expect(xml.includes('2026-05-07')).toBe(true);
    expect(xml.includes('自报价之日起 30 天')).toBe(true);
    expect(xml.includes('订单数量：10')).toBe(true);
    expect(xml.includes('交期：2026-06-01')).toBe(true);
    expect(xml.includes('含税单价（元）')).toBe(true);
    expect(xml.includes('含税总额（元）')).toBe(true);
    expect(xml.includes('合计（含税总金额）')).toBe(true);
    expect(xml.includes('贰佰贰拾元玖角整')).toBe(true);
    expect(xml.includes('备注说明')).toBe(true);
    expect(xml.includes('报价人：李经理')).toBe(true);
    // 需求3：不再出现盖章处
    expect(xml.includes('公司盖章处')).toBe(false);
  });

  it('未税价：表头与合计显示不含税，金额=数量×单价', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        ...input,
        items: [
          {
            materialCode: 'X1',
            materialName: '未税物料',
            chipModel: 'X1',
            brand: '测试',
            qty: 2,
            unitPrice: 100,
            priceTaxIncluded: false,
            taxRate: 13,
            subtotal: 200,
            remark: null,
          },
        ],
        totalAmount: 200,
      }),
    );
    expect(xml.includes('不含税单价（元）')).toBe(true);
    expect(xml.includes('不含税总额（元）')).toBe(true);
    expect(xml.includes('合计（不含税总金额）')).toBe(true);
    expect(xml.includes('>含税单价（元）<')).toBe(false);
    expect(xml.includes('>不含税单价（元）<')).toBe(true);
    expect(xml.includes('113.00')).toBe(false); // 不再按税率换算
    expect(lineAmount({ ...input.items[0], qty: 2, unitPrice: 100, priceTaxIncluded: false })).toBe(200);
  });

  it('需求数量为空：不显示数量列、金额列与合计', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        ...input,
        items: input.items.map((it) => ({ ...it, qty: 0 })),
      }),
    );
    expect(xml.includes('需求数量')).toBe(false);
    expect(xml.includes('含税总额')).toBe(false);
    expect(xml.includes('合计（含税总金额）')).toBe(false);
    expect(xml.includes('合计人民币')).toBe(false);
    // 明细本身仍在
    expect(xml.includes('GD32F407ZGT6')).toBe(true);
  });

  it('部分行有数量：数量/金额列保留，空行金额留空', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        ...input,
        items: [
          { ...input.items[0], qty: 5 },
          { ...input.items[1], qty: 0, subtotal: null },
        ],
      }),
    );
    expect(xml.includes('需求数量')).toBe(true);
    expect(xml.includes('含税总额（元）')).toBe(true);
    expect(xml.includes('74.70')).toBe(false);
    expect(xml.includes('146.20')).toBe(true);
  });

  it('空字段不出现对应栏目', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        companyName: '测试公司',
        customerName: null,
        contact: null,
        phone: null,
        address: null,
        date: null,
        validityDays: null,
        orderQty: null,
        deliveryDate: null,
        salesPerson: null,
        salesPhone: null,
        items: input.items,
        totalAmount: 220.9,
        notes: [],
        footer: '',
      }),
    );
    expect(xml.includes('客户单位全称')).toBe(false);
    expect(xml.includes('对接人')).toBe(false);
    expect(xml.includes('客户地址')).toBe(false);
    expect(xml.includes('报价日期')).toBe(false);
    expect(xml.includes('报价有效期')).toBe(false);
    expect(xml.includes('订单数量')).toBe(false);
    expect(xml.includes('交期：')).toBe(false);
    expect(xml.includes('报价人')).toBe(false);
    expect(xml.includes('备注说明')).toBe(false);
    expect(xml.includes('合计（含税总金额）')).toBe(true);
  });

  it('备注可增删', () => {
    const withExtra = xmlOf(buildQuoteDocx({ ...input, notes: [...input.notes, '3、质保期：1 年'] }));
    expect(withExtra.includes('3、质保期：1 年')).toBe(true);
    const none = xmlOf(buildQuoteDocx({ ...input, notes: [] }));
    expect(none.includes('备注说明')).toBe(false);
  });

  it('人民币大写转换', () => {
    expect(rmbUppercase(1624.38)).toBe('壹仟陆佰贰拾肆元叁角捌分');
    expect(rmbUppercase(0)).toBe('零元整');
    expect(rmbUppercase(10000)).toBe('壹万元整');
    expect(rmbUppercase(100.05)).toBe('壹佰元零伍分');
    expect(rmbUppercase(1234.5)).toBe('壹仟贰佰叁拾肆元伍角整');
  });

  it('文件名=客户简称+报价单_日期(2026.5.7)', () => {
    expect(quoteDocxFileName('丹芬瑞', '2026-05-07')).toBe('丹芬瑞报价单_2026.5.7.docx');
    expect(quoteDocxFileName('丹芬瑞')).toMatch(/^丹芬瑞报价单_\d{4}\.\d{1,2}\.\d{1,2}\.docx$/);
  });
});
