/* 渲染冒烟用 preload：用桩数据替代 IPC，验证页面是否能正常渲染（不依赖主进程） */
const { contextBridge } = require('electron');

const order = {
  id: 1,
  orderNo: 'XS202610280001',
  customerId: 1,
  orderDate: '2026-10-28',
  typeId: null,
  statusId: 1,
  expectedDeliveryDate: null,
  actualDeliveryDate: null,
  totalAmount: 146.2,
  amountManual: false,
  paymentMethodId: null,
  isKey: false,
  remark: null,
  createdAt: '2026-10-28 10:00:00',
  updatedAt: '2026-10-28 10:00:00',
  customerName: '长沙丹芬瑞电气技术有限公司',
  customerDeleted: false,
  customerContact: '张三',
  typeName: null,
  statusName: '待确认',
  statusColor: '#1677FF',
  statusIsTerminal: false,
  daysOverdue: 0,
  items: [
    {
      id: 1,
      orderId: 1,
      materialId: 1,
      materialCode: 'RDDZX03001',
      materialName: 'ARM处理器',
      chipModel: 'GD32F407ZGT6',
      brand: '兆易创新',
      packageSpec: null,
      qty: 5,
      unitPrice: 29.24,
      purchasePrice: 12.5,
      priceTaxIncluded: true,
      purchaseTaxIncluded: true,
      taxRate: 13,
      subtotal: 146.2,
      customerPn: null,
      remark: null,
      sortOrder: 1,
    },
  ],
  nodes: [
    { id: 1, orderId: 1, templateId: 1, templateCode: 'demand', name: '需求沟通', status: 'pending', planTime: null, actualTime: null, sortOrder: 1, createdAt: '', updatedAt: '' },
    { id: 2, orderId: 1, templateId: 2, templateCode: 'quote', name: '报价中', status: 'pending', planTime: null, actualTime: null, sortOrder: 2, createdAt: '', updatedAt: '' },
  ],
  wechatGroups: [],
};

const map = {
  'orders:get': order,
  'statuses:list': [{ id: 1, name: '待确认', color: '#1677FF', isTerminal: false }],
  'dicts:list': [],
  'customers:get': { id: 1, name: '长沙丹芬瑞电气技术有限公司', deletedAt: null },
  'orderDocs:list': [],
  'customers:options': [],
  'materials:options': [],
};

contextBridge.exposeInMainWorld('api', {
  invoke: async (channel) => ({ ok: true, data: map[channel] ?? null }),
  health: async () => ({ ok: true, dataDir: '/tmp' }),
  onDataChanged: () => () => {},
});
