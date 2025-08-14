import { Router } from 'express';
import { asyncHandler, AppError, createPaginationOptions, createPaginationResponse } from '@anatome-ai/utils';
import { QueueManager } from '../services/queueManager';
import { JobModel } from '../models/job';

export const jobRoutes = Router();
const queueManager = QueueManager.getInstance();

// Create a new job
jobRoutes.post('/', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { queue, type, data, options } = req.body;

  if (!queue || !type || !data) {
    throw new AppError('Queue, type, and data are required', 400, 'VALIDATION_ERROR');
  }

  // Validate queue exists
  if (!Object.values(QueueManager.QUEUES).includes(queue)) {
    throw new AppError('Invalid queue name', 400, 'INVALID_QUEUE');
  }

  // Validate job type exists
  if (!Object.values(QueueManager.JOB_TYPES).includes(type)) {
    throw new AppError('Invalid job type', 400, 'INVALID_JOB_TYPE');
  }

  const jobData = {
    ...data,
    userId,
  };

  const job = await queueManager.addJob(queue, type, jobData, options);

  res.status(201).json({
    success: true,
    data: {
      jobId: job.id,
      queue,
      type,
      status: 'waiting',
      createdAt: new Date(),
    },
  });
}));

// Get job by ID
jobRoutes.get('/:jobId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { jobId } = req.params;

  // Get job from database
  const jobDoc = await JobModel.findOne({ jobId });
  
  if (!jobDoc) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  // Check permissions (user can only see their own jobs unless admin)
  if (userRole !== 'admin' && jobDoc.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Get live job status from Bull
  const bullJob = await queueManager.getJob(jobId);
  
  let liveStatus = jobDoc.status;
  let progress = null;
  
  if (bullJob) {
    liveStatus = await bullJob.getState();
    progress = bullJob.progress();
  }

  res.json({
    success: true,
    data: {
      jobId: jobDoc.jobId,
      queue: jobDoc.queue,
      type: jobDoc.type,
      status: liveStatus,
      progress,
      data: jobDoc.data,
      result: jobDoc.result,
      error: jobDoc.error,
      attempts: jobDoc.attempts,
      maxAttempts: jobDoc.maxAttempts,
      processingTime: jobDoc.processingTime,
      createdAt: jobDoc.createdAt,
      startedAt: jobDoc.startedAt,
      completedAt: jobDoc.completedAt,
      failedAt: jobDoc.failedAt,
    },
  });
}));

// Get user's jobs with pagination
jobRoutes.get('/user/:userId', asyncHandler(async (req, res) => {
  const requestingUserId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  const { userId } = req.params;

  if (!requestingUserId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  // Check permissions
  if (userRole !== 'admin' && requestingUserId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { skip } = createPaginationOptions(page, limit);

  const filter: any = { userId };
  
  // Filter by status if provided
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Filter by queue if provided
  if (req.query.queue) {
    filter.queue = req.query.queue;
  }

  // Filter by type if provided
  if (req.query.type) {
    filter.type = req.query.type;
  }

  const [jobs, total] = await Promise.all([
    JobModel.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .select('-data'), // Exclude potentially large data field
    JobModel.countDocuments(filter),
  ]);

  const response = createPaginationResponse(
    jobs.map(job => ({
      jobId: job.jobId,
      queue: job.queue,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      processingTime: job.processingTime,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      hasError: !!job.error,
    })),
    total,
    page,
    limit
  );

  res.json({
    success: true,
    ...response,
  });
}));

// Cancel a job
jobRoutes.delete('/:jobId', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { jobId } = req.params;

  // Get job from database
  const jobDoc = await JobModel.findOne({ jobId });
  
  if (!jobDoc) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  // Check permissions
  if (userRole !== 'admin' && jobDoc.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Check if job can be cancelled
  if (['completed', 'failed'].includes(jobDoc.status)) {
    throw new AppError('Cannot cancel completed or failed job', 400, 'JOB_NOT_CANCELLABLE');
  }

  // Cancel the Bull job
  const bullJob = await queueManager.getJob(jobId);
  if (bullJob) {
    await bullJob.remove();
  }

  // Update database
  jobDoc.status = 'failed';
  jobDoc.error = 'Cancelled by user';
  jobDoc.failedAt = new Date();
  await jobDoc.save();

  res.json({
    success: true,
    message: 'Job cancelled successfully',
  });
}));

// Retry a failed job
jobRoutes.post('/:jobId/retry', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { jobId } = req.params;

  // Get job from database
  const jobDoc = await JobModel.findOne({ jobId });
  
  if (!jobDoc) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  // Check permissions
  if (userRole !== 'admin' && jobDoc.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Check if job can be retried
  if (jobDoc.status !== 'failed') {
    throw new AppError('Only failed jobs can be retried', 400, 'JOB_NOT_RETRYABLE');
  }

  // Create a new job with the same data
  const newJob = await queueManager.addJob(
    jobDoc.queue,
    jobDoc.type,
    jobDoc.data,
    {
      attempts: jobDoc.maxAttempts,
      priority: jobDoc.priority,
    }
  );

  res.json({
    success: true,
    data: {
      newJobId: newJob.id,
      originalJobId: jobId,
      message: 'Job retried successfully',
    },
  });
}));

// Get job logs (if available)
jobRoutes.get('/:jobId/logs', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { jobId } = req.params;

  // Get job from database
  const jobDoc = await JobModel.findOne({ jobId });
  
  if (!jobDoc) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  // Check permissions
  if (userRole !== 'admin' && jobDoc.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Get Bull job for logs
  const bullJob = await queueManager.getJob(jobId);
  
  let logs = [];
  if (bullJob && bullJob.opts && bullJob.opts.removeOnComplete === false) {
    // Logs might be available in job data or external log system
    logs = bullJob.opts.logs || [];
  }

  res.json({
    success: true,
    data: {
      jobId,
      logs,
      error: jobDoc.error,
      result: jobDoc.result,
    },
  });
}));

// Bulk operations
jobRoutes.post('/bulk/cancel', asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  
  if (!userId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  const { jobIds } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    throw new AppError('Job IDs array is required', 400, 'VALIDATION_ERROR');
  }

  const filter: any = { jobId: { $in: jobIds } };
  
  // Non-admin users can only cancel their own jobs
  if (userRole !== 'admin') {
    filter.userId = userId;
  }

  const jobs = await JobModel.find(filter);
  const results = [];

  for (const job of jobs) {
    try {
      if (['completed', 'failed'].includes(job.status)) {
        results.push({
          jobId: job.jobId,
          status: 'skipped',
          reason: 'Job already completed or failed',
        });
        continue;
      }

      // Cancel the Bull job
      const bullJob = await queueManager.getJob(job.jobId);
      if (bullJob) {
        await bullJob.remove();
      }

      // Update database
      job.status = 'failed';
      job.error = 'Bulk cancelled by user';
      job.failedAt = new Date();
      await job.save();

      results.push({
        jobId: job.jobId,
        status: 'cancelled',
      });
    } catch (error: any) {
      results.push({
        jobId: job.jobId,
        status: 'error',
        error: error.message,
      });
    }
  }

  res.json({
    success: true,
    data: {
      total: jobIds.length,
      processed: results.length,
      results,
    },
  });
}));

// Get job statistics for a user
jobRoutes.get('/user/:userId/stats', asyncHandler(async (req, res) => {
  const requestingUserId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  const { userId } = req.params;

  if (!requestingUserId) {
    throw new AppError('User authentication required', 401, 'AUTH_REQUIRED');
  }

  // Check permissions
  if (userRole !== 'admin' && requestingUserId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  const stats = await JobModel.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTime' },
      },
    },
  ]);

  const queueStats = await JobModel.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$queue',
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
      },
    },
  ]);

  const typeStats = await JobModel.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTime' },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      statusStats: stats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          avgProcessingTime: stat.avgProcessingTime || 0,
        };
        return acc;
      }, {}),
      queueStats: queueStats.reduce((acc, stat) => {
        acc[stat._id] = stat;
        return acc;
      }, {}),
      typeStats: typeStats.reduce((acc, stat) => {
        acc[stat._id] = stat;
        return acc;
      }, {}),
    },
  });
}));