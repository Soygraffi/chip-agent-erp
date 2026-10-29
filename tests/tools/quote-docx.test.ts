import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import AdmZip from 'adm-zip';
import { buildQuoteDocx, quoteDocxFileName, rmbUppercase } from '@erp/tools';

const input = {
  companyName: '湖北长江光电子信息产业供应链有限公司',
  customerName: '长沙丹芬瑞电气技术有限公司',
  contact: '张工',
  phone: '13800000000',
  address: '长沙市岳麓区xx路xx号',
  date: '2026-10-29',
  validityDays: 30,
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

describe('Word 报价单（V1.8：可填写字段 + 空字段隐藏）', () => {
  it('生成合法的 docx 包结构', () => {
    const buf = buildQuoteDocx(input);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const names = new AdmZip(buf)
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/styles.xml');
  });

  it('完整信息：抬头、客户、8 列表头、合计、大写、备注、签章', () => {
    const xml = xmlOf(buildQuoteDocx(input));
    expect(xml.includes('湖北长江光电子信息产业供应链有限公司')).toBe(true);
    expect(xml.includes('长沙丹芬瑞电气技术有限公司')).toBe(true);
    expect(xml.includes('张工')).toBe(true);
    expect(xml.includes('13800000000')).toBe(true);
    expect(xml.includes('长沙市岳麓区xx路xx号')).toBe(true);
    expect(xml.includes('2026-10-29')).toBe(true);
    expect(xml.includes('自报价之日起 30 天')).toBe(true);
    expect(xml.includes('李经理')).toBe(true);
    expect(xml.includes('13900000000')).toBe(true);
    expect(xml.includes('交期 / 备注（选填）')).toBe(true);
    expect(xml.includes('146.20')).toBe(true);
    expect(xml.includes('220.90')).toBe(true);
    expect(xml.includes('合计（含税总金额）')).toBe(true);
    expect(xml.includes('贰佰贰拾元玖角整')).toBe(true);
    expect(xml.includes('交货周期')).toBe(true);
    expect(xml.includes('请随时向我们垂询')).toBe(true);
    expect(xml.includes('w:orient="landscape"')).toBe(true);
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
    expect(xml.includes('报价人')).toBe(false);
    expect(xml.includes('（公司盖章处）')).toBe(false);
    expect(xml.includes('备注说明')).toBe(false);
    // 明细与合计仍然存在
    expect(xml.includes('合计（含税总金额）')).toBe(true);
  });

  it('部分字段为空：其余栏目正常且不残留空标签', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        ...input,
        phone: '',
        address: null,
        validityDays: 0,
        salesPhone: null,
      }),
    );
    expect(xml.includes('对接人：张工')).toBe(true);
    expect(xml.includes('联系电话')).toBe(false); // 客户电话为空
    expect(xml.includes('报价有效期')).toBe(false); // 0 天不显示
    expect(xml.includes('报价人：李经理')).toBe(true);
    expect(xml.includes('（公司盖章处）')).toBe(true);
  });

  it('备注可增删：新增一行进入文档，删空后整块省略', () => {
    const withExtra = xmlOf(
      buildQuoteDocx({ ...input, notes: [...input.notes, '3、质保期：1 年'] }),
    );
    expect(withExtra.includes('3、质保期：1 年')).toBe(true);
    const none = xmlOf(buildQuoteDocx({ ...input, notes: [] }));
    expect(none.includes('备注说明')).toBe(false);
  });

  it('不含税价按税率换算为含税价', () => {
    const xml = xmlOf(
      buildQuoteDocx({
        ...input,
        items: [
          {
            materialCode: 'X1',
            materialName: '测试',
            chipModel: 'X1',
            qty: 2,
            unitPrice: 100,
            priceTaxIncluded: false,
            taxRate: 13,
            subtotal: 226,
            remark: null,
          },
        ],
        totalAmount: 226,
      }),
    );
    expect(xml.includes('113.00')).toBe(true);
    expect(xml.includes('226.00')).toBe(true);
  });

  it('人民币大写转换', () => {
    expect(rmbUppercase(1624.38)).toBe('壹仟陆佰贰拾肆元叁角捌分');
    expect(rmbUppercase(0)).toBe('零元整');
    expect(rmbUppercase(10000)).toBe('壹万元整');
    expect(rmbUppercase(100.05)).toBe('壹佰元零伍分');
    expect(rmbUppercase(1234.5)).toBe('壹仟贰佰叁拾肆元伍角整');
  });

  it('文件名包含客户名与日期', () => {
    const name = quoteDocxFileName('长沙丹芬瑞电气技术有限公司');
    expect(name).toMatch(/^报价单_长沙丹芬瑞电气技术有限公司_\d{8}_\d{4}\.docx$/);
  });
});
