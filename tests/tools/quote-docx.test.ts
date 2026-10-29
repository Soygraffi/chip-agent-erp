import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import AdmZip from 'adm-zip';
import { buildQuoteDocx, quoteDocxFileName, rmbUppercase } from '@erp/tools';

const input = {
  companyName: '湖北长江光电子信息产业供应链有限公司',
  customerName: '长沙丹芬瑞电气技术有限公司',
  orderNo: 'XS202610290001',
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
  terms: '1、交货周期：具体交货时间以合同约定时间为准\n2、付款方式：票到月结30天付现',
  footer: '如果对上述条款有任何问题，请随时向我们垂询。',
};

describe('Word 报价单（V1.7）', () => {
  it('生成合法的 docx 包结构', () => {
    const buf = buildQuoteDocx(input);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/styles.xml');
  });

  it('内容包含公司抬头、客户、明细、合计与说明', () => {
    const zip = new AdmZip(buildQuoteDocx(input));
    const xml = zip.getEntry('word/document.xml')!.getData().toString('utf8');
    expect(xml.includes('湖北长江光电子信息产业供应链有限公司')).toBe(true);
    expect(xml.includes('长沙丹芬瑞电气技术有限公司')).toBe(true);
    expect(xml.includes('RDDZX03001')).toBe(true);
    expect(xml.includes('GD32F407ZGT6')).toBe(true);
    expect(xml.includes('146.20')).toBe(true);
    expect(xml.includes('220.90')).toBe(true);
    expect(xml.includes('合计（含税总金额）')).toBe(true);
    expect(xml.includes('贰佰贰拾元玖角整')).toBe(true);
    expect(xml.includes('报价有效期')).toBe(true);
    expect(xml.includes('交期 / 备注（选填）')).toBe(true);
    expect(xml.includes('w:orient="landscape"')).toBe(true);
    expect(xml.includes('交货周期')).toBe(true);
    expect(xml.includes('请随时向我们垂询')).toBe(true);
  });

  it('不含税价按税率换算为含税价', () => {
    const zip = new AdmZip(
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
    const xml = zip.getEntry('word/document.xml')!.getData().toString('utf8');
    expect(xml.includes('113.00')).toBe(true); // 含税单价
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
