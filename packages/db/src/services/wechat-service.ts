import type { DatabaseSync } from 'node:sqlite';
import type { WechatGroup, WechatMember } from '@erp/shared';
import { bizError } from '@erp/shared';
import {
  deleteGroup,
  deleteMember,
  getGroup,
  getMember,
  insertGroup,
  insertMember,
  listGroups,
  listGroupsByOrder,
  listMembers,
  setOrderGroups,
  updateGroup,
  updateMember,
} from '../repos/wechat-repo.js';

export const wechatService = {
  listGroups(db: DatabaseSync, customerId: number): WechatGroup[] {
    return listGroups(db, customerId);
  },

  createGroup(
    db: DatabaseSync,
    customerId: number,
    input: { name: string; remark?: string | null },
  ): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '群名称不能为空');
    return insertGroup(db, customerId, { name: input.name.trim(), remark: input.remark ?? null });
  },

  updateGroup(
    db: DatabaseSync,
    id: number,
    input: { name?: string; remark?: string | null },
  ): void {
    if (!getGroup(db, id)) throw bizError('NOT_FOUND', '微信群不存在');
    if (input.name !== undefined && (!input.name || !input.name.trim()))
      throw bizError('VALIDATION', '群名称不能为空');
    updateGroup(db, id, { ...input, name: input.name?.trim() });
  },

  deleteGroup(db: DatabaseSync, id: number): void {
    if (!getGroup(db, id)) throw bizError('NOT_FOUND', '微信群不存在');
    deleteGroup(db, id);
  },

  listMembers(db: DatabaseSync, groupId: number): WechatMember[] {
    return listMembers(db, groupId);
  },

  createMember(
    db: DatabaseSync,
    groupId: number,
    input: { wechatId: string; realName?: string | null; position?: string | null; remark?: string | null },
  ): number {
    if (!getGroup(db, groupId)) throw bizError('NOT_FOUND', '微信群不存在');
    if (!input.wechatId || !input.wechatId.trim())
      throw bizError('VALIDATION', '微信号不能为空');
    return insertMember(db, groupId, {
      wechatId: input.wechatId.trim(),
      realName: input.realName ?? null,
      position: input.position ?? null,
      remark: input.remark ?? null,
    });
  },

  updateMember(
    db: DatabaseSync,
    id: number,
    input: { wechatId?: string; realName?: string | null; position?: string | null; remark?: string | null },
  ): void {
    if (!getMember(db, id)) throw bizError('NOT_FOUND', '群成员不存在');
    if (input.wechatId !== undefined && (!input.wechatId || !input.wechatId.trim()))
      throw bizError('VALIDATION', '微信号不能为空');
    updateMember(db, id, {
      ...input,
      wechatId: input.wechatId?.trim(),
    });
  },

  deleteMember(db: DatabaseSync, id: number): void {
    if (!getMember(db, id)) throw bizError('NOT_FOUND', '群成员不存在');
    deleteMember(db, id);
  },

  listOrderGroups(db: DatabaseSync, orderId: number): WechatGroup[] {
    return listGroupsByOrder(db, orderId);
  },

  setOrderGroups(db: DatabaseSync, orderId: number, groupIds: number[]): void {
    setOrderGroups(db, orderId, groupIds);
  },
};
