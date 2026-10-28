import type { DatabaseSync } from 'node:sqlite';
import type { DashboardStats, ReminderItem } from '@erp/shared';
import { todayStr } from '@erp/shared';
import { computeReminders } from '@erp/domain';
import { dashboard, reminderCandidates } from '../repos/stats-repo.js';

export const statsService = {
  dashboard(db: DatabaseSync, today = todayStr()): DashboardStats {
    return dashboard(db, today);
  },

  reminders(db: DatabaseSync, today = todayStr()): { overdue: ReminderItem[]; upcoming: ReminderItem[] } {
    const candidates = reminderCandidates(db, today);
    return computeReminders(candidates, today);
  },
};
