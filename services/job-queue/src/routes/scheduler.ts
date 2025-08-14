import { Router } from 'express';
import { asyncHandler, AppError } from '@anatome-ai/utils';
import { JobScheduler } from '../services/scheduler';
import { QueueManager } from '../services/queueManager';

export const schedulerRoutes = Router();
const scheduler = JobScheduler.getInstance();
const queueManager = QueueManager.getInstance();

// Get scheduler statistics
schedulerRoutes.get('/stats', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const stats = await scheduler.getSchedulerStats();

  res.json({
    success: true,
    data: stats,
  });
}));

// Get all scheduled jobs
schedulerRoutes.get('/jobs', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const scheduledJobs = scheduler.getScheduledJobs();

  res.json({
    success: true,
    data: {
      total: scheduledJobs.length,
      jobs: scheduledJobs.map(jobName => ({
        name: jobName,
        type: 'recurring',
        status: 'active',
      })),
    },
  });
}));

// Schedule a delayed job
schedulerRoutes.post('/delayed', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { queue, type, data, delayMs } = req.body;

  if (!queue || !type || !data || delayMs === undefined) {
    throw new AppError('Queue, type, data, and delayMs are required', 400, 'VALIDATION_ERROR');
  }

  // Validate queue exists
  if (!Object.values(QueueManager.QUEUES).includes(queue)) {
    throw new AppError('Invalid queue name', 400, 'INVALID_QUEUE');
  }

  // Validate job type exists
  if (!Object.values(QueueManager.JOB_TYPES).includes(type)) {
    throw new AppError('Invalid job type', 400, 'INVALID_JOB_TYPE');
  }

  // Check delay is reasonable (max 7 days)
  const maxDelay = 7 * 24 * 60 * 60 * 1000;
  if (delayMs > maxDelay) {
    throw new AppError('Delay cannot exceed 7 days', 400, 'INVALID_DELAY');
  }

  const jobData = {
    ...data,
    userId,
    scheduledBy: userId,
  };

  await scheduler.scheduleDelayedJob(queue, type, jobData, delayMs);

  res.json({
    success: true,
    data: {
      queue,
      type,
      delayMs,
      executeAt: new Date(Date.now() + delayMs),
      message: 'Delayed job scheduled successfully',
    },
  });
}));

// Schedule a repeating job (admin only)
schedulerRoutes.post('/repeating', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queue, type, data, cronExpression, description } = req.body;

  if (!queue || !type || !data || !cronExpression) {
    throw new AppError('Queue, type, data, and cronExpression are required', 400, 'VALIDATION_ERROR');
  }

  // Validate queue exists
  if (!Object.values(QueueManager.QUEUES).includes(queue)) {
    throw new AppError('Invalid queue name', 400, 'INVALID_QUEUE');
  }

  // Validate job type exists
  if (!Object.values(QueueManager.JOB_TYPES).includes(type)) {
    throw new AppError('Invalid job type', 400, 'INVALID_JOB_TYPE');
  }

  // Basic cron validation (should have 5 or 6 parts)
  const cronParts = cronExpression.trim().split(/\s+/);
  if (cronParts.length < 5 || cronParts.length > 6) {
    throw new AppError('Invalid cron expression', 400, 'INVALID_CRON');
  }

  const jobData = {
    ...data,
    scheduledBy: userId,
    description: description || `Recurring ${type} job`,
  };

  await scheduler.scheduleRepeatingJob(queue, type, jobData, cronExpression);

  res.json({
    success: true,
    data: {
      queue,
      type,
      cronExpression,
      description,
      message: 'Repeating job scheduled successfully',
    },
  });
}));

// Cancel a scheduled job (admin only)
schedulerRoutes.delete('/jobs/:jobName', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { jobName } = req.params;

  const cancelled = await scheduler.cancelScheduledJob(jobName);

  if (!cancelled) {
    throw new AppError('Scheduled job not found', 404, 'JOB_NOT_FOUND');
  }

  res.json({
    success: true,
    message: `Scheduled job '${jobName}' cancelled successfully`,
  });
}));

// Trigger a scheduled job manually (admin only)
schedulerRoutes.post('/jobs/:jobName/trigger', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId || userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { jobName } = req.params;
  const { data = {} } = req.body;

  // For system jobs, we can trigger them directly
  const systemJobs = {
    'cleanup-expired-jobs': {
      queue: QueueManager.QUEUES.CLEANUP,
      type: QueueManager.JOB_TYPES.CLEANUP_EXPIRED_JOBS,
    },
    'health-check-services': {
      queue: QueueManager.QUEUES.CLEANUP,
      type: QueueManager.JOB_TYPES.HEALTH_CHECK_SERVICES,
    },
  };

  const systemJob = systemJobs[jobName as keyof typeof systemJobs];
  
  if (!systemJob) {
    throw new AppError('Cannot manually trigger this job type', 400, 'JOB_NOT_TRIGGERABLE');
  }

  const jobData = {
    ...data,
    triggeredBy: userId,
    manualTrigger: true,
  };

  const job = await queueManager.addJob(systemJob.queue, systemJob.type, jobData);

  res.json({
    success: true,
    data: {
      jobId: job.id,
      jobName,
      message: 'Job triggered successfully',
    },
  });
}));

// Get queue health summary
schedulerRoutes.get('/health', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const stats = await scheduler.getSchedulerStats();
  const queueStats = await queueManager.getQueueStats();

  const healthSummary = {
    overall: 'healthy',
    scheduler: {
      status: 'running',
      scheduledJobs: stats.scheduledJobsCount,
      uptime: stats.uptime,
    },
    queues: Object.entries(queueStats).map(([name, queueStat]) => {
      let status = 'healthy';
      
      if (queueStat.failed > 10 && queueStat.failed > queueStat.completed * 0.1) {
        status = 'warning';
      }
      
      if (queueStat.failed > queueStat.completed) {
        status = 'error';
      }

      return {
        name,
        status,
        active: queueStat.active,
        waiting: queueStat.waiting,
        completed: queueStat.completed,
        failed: queueStat.failed,
        total: queueStat.total,
      };
    }),
  };

  // Determine overall health
  const hasErrors = healthSummary.queues.some(q => q.status === 'error');
  const hasWarnings = healthSummary.queues.some(q => q.status === 'warning');

  if (hasErrors) {
    healthSummary.overall = 'error';
  } else if (hasWarnings) {
    healthSummary.overall = 'warning';
  }

  res.json({
    success: true,
    data: healthSummary,
  });
}));

// Get system performance metrics
schedulerRoutes.get('/metrics', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const queueStats = await queueManager.getQueueStats();
  
  // Calculate system-wide metrics
  let totalJobs = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalActive = 0;
  let totalWaiting = 0;

  Object.values(queueStats).forEach(stat => {
    totalJobs += stat.total;
    totalCompleted += stat.completed;
    totalFailed += stat.failed;
    totalActive += stat.active;
    totalWaiting += stat.waiting;
  });

  const successRate = totalJobs > 0 ? (totalCompleted / totalJobs) * 100 : 0;
  const failureRate = totalJobs > 0 ? (totalFailed / totalJobs) * 100 : 0;

  res.json({
    success: true,
    data: {
      systemMetrics: {
        totalJobs,
        totalCompleted,
        totalFailed,
        totalActive,
        totalWaiting,
        successRate: parseFloat(successRate.toFixed(2)),
        failureRate: parseFloat(failureRate.toFixed(2)),
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          usage: parseFloat(((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2)),
        },
      },
      queueMetrics: queueStats,
      timestamp: new Date(),
    },
  });
}));