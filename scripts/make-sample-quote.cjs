const { buildQuoteDocx } = require('../packages/tools/dist/index.js');
const fs = require('node:fs');

const buf = buildQuoteDocx({
  companyName: '湖北长江光电子信息产业供应链有限公司',
  customerName: '长沙丹芬瑞电气技术有限公司',
  orderNo: 'XS202610290001',
  contact: '张工',
  phone: '138 0000 0000',
  address: '长沙市岳麓区xx路xx号',
  date: new Date().toISOString().slice(0, 10),
  validityDays: 30,
  salesPerson: '李经理',
  salesPhone: '139 0000 0000',
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
      remark: '交期 7 天',
    },
    {
      materialCode: 'WGC3000008',
      materialName: '聚丙烯电容',
      chipModel: 'C823A224KB0C000',
      brand: '厦门法拉',
      qty: 400,
      unitPrice: 3.24875,
      priceTaxIncluded: true,
      taxRate: 13,
      subtotal: 1299.5,
      remark: '—',
    },
  ],
  totalAmount: 1520.4,
  notes: [
    '1、本报价含 13% 增值税专用发票；报价有效期 30 天。',
    '2、交货周期：以双方正式合同 / 订单确认为准。',
    '3、付款方式：票到月结 30 天付现。',
  ],
  footer: '如果对上述条款有任何问题，请随时向我们垂询。',
});
fs.writeFileSync('C:/Users/pengh/Projects/sample-quote.docx', buf);
console.log('written', buf.length, 'bytes');
