const { buildQuoteDocx, quoteDocxFileName } = require('../packages/tools/dist/index.js');
const fs = require('node:fs');

const base = {
  companyName: '湖北长江光电子信息产业供应链有限公司',
  customerName: '长沙丹芬瑞电气技术有限公司',
  contact: '张工',
  phone: '138 0000 0000',
  address: '长沙市岳麓区xx路xx号',
  date: new Date().toISOString().slice(0, 10),
  validityDays: 30,
  orderQty: 10,
  deliveryDate: '2026-06-01',
  salesPerson: '李经理',
  salesPhone: '139 0000 0000',
  notes: [
    '1、本报价含 13% 增值税专用发票；报价有效期 30 天。',
    '2、交货周期：以双方正式合同 / 订单确认为准。',
  ],
  footer: '如果对上述条款有任何问题，请随时向我们垂询。',
};

const taxedItems = [
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
];

// 1) 含税、有数量
fs.writeFileSync(
  'C:/Users/pengh/Projects/sample-quote.docx',
  buildQuoteDocx({ ...base, items: taxedItems, totalAmount: 220.9 }),
);

// 2) 未税口径
fs.writeFileSync(
  'C:/Users/pengh/Projects/sample-quote-untaxed.docx',
  buildQuoteDocx({
    ...base,
    items: [
      {
        materialCode: 'RDDZX03001',
        materialName: 'ARM处理器',
        chipModel: 'GD32F407ZGT6',
        brand: '兆易创新',
        qty: 5,
        unitPrice: 25.88,
        priceTaxIncluded: false,
        taxRate: 13,
        remark: '未税价',
      },
    ],
    totalAmount: 129.4,
  }),
);

// 3) 没有数量
fs.writeFileSync(
  'C:/Users/pengh/Projects/sample-quote-noqty.docx',
  buildQuoteDocx({
    ...base,
    orderQty: null,
    deliveryDate: null,
    items: taxedItems.map((it) => ({ ...it, qty: 0 })),
    totalAmount: 0,
  }),
);

console.log('filename sample:', quoteDocxFileName('丹芬瑞', '2026-05-07'));
console.log('written 3 samples');
