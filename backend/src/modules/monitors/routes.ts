import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { currentUserId, requireAuth } from '../../middleware/auth.js';
import { runCheckNow } from '../../engine/runner.js';
import { getAllUptime, getChecksSeries, getRecentChecks, RANGES, type Range } from '../checks/service.js';
import { listIncidents } from '../incidents/service.js';
import { getDashboard } from './dashboard.js';
import { createMonitorSchema, monitorIdSchema, updateMonitorSchema } from './schemas.js';
import * as monitorService from './service.js';

export const monitorsRouter = Router();

// Every monitor route is owner-scoped, so the guard goes on the whole router.
monitorsRouter.use(requireAuth);

const rangeSchema = z.object({
  range: z.enum(Object.keys(RANGES) as [Range, ...Range[]]).default('24h'),
});

/** List is the dashboard payload: monitors + 24h uptime + sparkline, cached. */
monitorsRouter.get('/', async (req, res) => {
  const monitors = await getDashboard(currentUserId(req));
  res.json({ monitors });
});

monitorsRouter.post('/', async (req, res) => {
  const input = parse(createMonitorSchema, req.body);
  const monitor = await monitorService.createMonitor(currentUserId(req), input);
  res.status(201).json({ monitor });
});

monitorsRouter.get('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const { id } = parse(monitorIdSchema, req.params);

  const monitor = await monitorService.getMonitor(userId, id);
  const [uptime, recentChecks] = await Promise.all([getAllUptime(id), getRecentChecks(id)]);

  res.json({ monitor, uptime, recentChecks });
});

monitorsRouter.patch('/:id', async (req, res) => {
  const { id } = parse(monitorIdSchema, req.params);
  const input = parse(updateMonitorSchema, req.body);
  const monitor = await monitorService.updateMonitor(currentUserId(req), id, input);
  res.json({ monitor });
});

monitorsRouter.delete('/:id', async (req, res) => {
  const { id } = parse(monitorIdSchema, req.params);
  await monitorService.deleteMonitor(currentUserId(req), id);
  res.status(204).end();
});

monitorsRouter.get('/:id/checks', async (req, res) => {
  const userId = currentUserId(req);
  const { id } = parse(monitorIdSchema, req.params);
  const { range } = parse(rangeSchema, req.query);

  // Ownership check first: otherwise the series endpoint would happily read
  // another user's checks.
  await monitorService.getMonitor(userId, id);

  const [series, uptime] = await Promise.all([getChecksSeries(id, range), getAllUptime(id)]);
  res.json({ range, series, uptime: uptime[range] });
});

monitorsRouter.get('/:id/incidents', async (req, res) => {
  const userId = currentUserId(req);
  const { id } = parse(monitorIdSchema, req.params);

  await monitorService.getMonitor(userId, id);

  const incidents = await listIncidents(id);
  res.json({ incidents });
});

/**
 * Check this monitor right now, outside the cron schedule. Without it, testing
 * a state transition means waiting a full interval.
 */
monitorsRouter.post('/:id/check', async (req, res) => {
  const { id } = parse(monitorIdSchema, req.params);
  const summary = await runCheckNow(currentUserId(req), id);
  const monitor = await monitorService.getMonitor(currentUserId(req), id);
  res.json({ summary, monitor });
});
