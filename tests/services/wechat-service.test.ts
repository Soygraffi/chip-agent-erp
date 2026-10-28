import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { wechatService, orderService, customerService, statusDictService } from '@erp/db';
import { createTestDb, seedCustomer } from '../db/helpers.ts';

describe('客户微信群与群成员（V1.2）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('一个客户可有多个群；群名称必填', () => {
    const cid = customerService.create(db, { name: '华强半导体' });
    wechatService.createGroup(db, cid, { name: '商务交流群' });
    wechatService.createGroup(db, cid, { name: '研发交流群', remark: '技术对接' });
    const groups = wechatService.listGroups(db, cid);
    expect(groups.map((g) => g.name)).toEqual(['商务交流群', '研发交流群']);
    expect(groups[1].remark).toBe('技术对接');
    expect(() => wechatService.createGroup(db, cid, { name: '  ' })).toThrowError(/群名称不能为空/);
  });

  it('群成员：微信号必填，真实姓名与岗位可空', () => {
    const cid = customerService.create(db, { name: 'A客户' });
    const gid = wechatService.createGroup(db, cid, { name: '商务交流群' });
    wechatService.createMember(db, gid, { wechatId: 'wx01', realName: '张三', position: '采购经理' });
    wechatService.createMember(db, gid, { wechatId: 'wx02' });
    const members = wechatService.listMembers(db, gid);
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ wechatId: 'wx01', realName: '张三', position: '采购经理' });
    expect(members[1].realName).toBeNull();
    expect(members[1].position).toBeNull();
    expect(() => wechatService.createMember(db, gid, { wechatId: ' ' })).toThrowError(/微信号不能为空/);
  });

  it('编辑与删除群/成员', () => {
    const cid = customerService.create(db, { name: 'A客户' });
    const gid = wechatService.createGroup(db, cid, { name: '商务群' });
    wechatService.updateGroup(db, gid, { name: '商务交流群' });
    expect(wechatService.listGroups(db, cid)[0].name).toBe('商务交流群');
    const mid = wechatService.createMember(db, gid, { wechatId: 'wx01' });
    wechatService.updateMember(db, mid, { realName: '李四', position: '硬件工程师' });
    expect(wechatService.listMembers(db, gid)[0]).toMatchObject({ realName: '李四', position: '硬件工程师' });
    wechatService.deleteMember(db, mid);
    expect(wechatService.listMembers(db, gid)).toHaveLength(0);
    wechatService.deleteGroup(db, gid);
    expect(wechatService.listGroups(db, cid)).toHaveLength(0);
  });

  it('订单只能关联本客户的微信群', () => {
    const c1 = customerService.create(db, { name: '客户一' });
    const c2 = customerService.create(db, { name: '客户二' });
    const g1 = wechatService.createGroup(db, c1, { name: '客户一群' });
    const g2 = wechatService.createGroup(db, c2, { name: '客户二群' });
    const statusId = statusDictService.list(db).find((s) => s.name === '进行中')!.id;
    const oid = orderService.create(db, {
      customerId: c1,
      statusId,
      items: [],
      wechatGroupIds: [g1],
    });
    expect(wechatService.listOrderGroups(db, oid).map((g) => g.name)).toEqual(['客户一群']);
    // 关联其他客户的群 → 拒绝
    expect(() =>
      orderService.create(db, { customerId: c1, statusId, items: [], wechatGroupIds: [g2] }),
    ).toThrowError(/必须属于该订单的客户/);
    // 更新时同样校验
    expect(() => orderService.update(db, oid, { wechatGroupIds: [g2] })).toThrowError(/必须属于该订单的客户/);
    orderService.update(db, oid, { wechatGroupIds: [] });
    expect(wechatService.listOrderGroups(db, oid)).toHaveLength(0);
  });
});
