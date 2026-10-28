/** 业务错误：服务层抛出，IPC/UI 统一转成用户可读提示 */
export class BizError extends Error {
  constructor(
    public code: BizErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BizError';
  }
}

export type BizErrorCode =
  | 'CUSTOMER_DUPLICATE'
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_DELETED'
  | 'ORDER_NO_DUPLICATE'
  | 'ORDER_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'DICT_IN_USE'
  | 'STATUS_IN_USE'
  | 'STATUS_SYSTEM'
  | 'TEMPLATE_IN_USE'
  | 'TEMPLATE_CODE_DUPLICATE'
  | 'STATUS_DEFAULT_DUPLICATE'
  | 'CURRENCY_NOT_FOUND'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'BACKUP_INVALID'
  | 'IO_ERROR';

export const BIZ_ERROR_MESSAGES: Record<BizErrorCode, string> = {
  CUSTOMER_DUPLICATE: '客户名称已存在',
  CUSTOMER_NOT_FOUND: '客户不存在',
  CUSTOMER_DELETED: '客户已删除',
  ORDER_NO_DUPLICATE: '订单编号已存在',
  ORDER_NOT_FOUND: '订单不存在',
  NODE_NOT_FOUND: '进度节点不存在',
  DICT_IN_USE: '该字典项已被业务数据引用，无法删除',
  STATUS_IN_USE: '该状态已被订单引用，无法删除',
  STATUS_SYSTEM: '系统预置状态不可删除',
  TEMPLATE_IN_USE: '该节点模板已被订单节点引用，无法删除',
  TEMPLATE_CODE_DUPLICATE: '语义码已被其他模板占用',
  STATUS_DEFAULT_DUPLICATE: '默认完成状态只能有一个',
  CURRENCY_NOT_FOUND: '币种不存在',
  VALIDATION: '数据校验失败',
  NOT_FOUND: '记录不存在',
  BACKUP_INVALID: '备份文件无效或已损坏',
  IO_ERROR: '文件读写失败',
};

export function bizError(code: BizErrorCode, detail?: string): BizError {
  const base = BIZ_ERROR_MESSAGES[code];
  return new BizError(code, detail ? `${base}：${detail}` : base);
}
