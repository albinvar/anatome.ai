import { Router } from 'express';
import { asyncHandler, AppError } from '@anatome-ai/utils';
import { QueueManager } from '../services/queueManager';
import { QueueModel } from '../models/queue';
import { JobModel } from '../models/job';

export const queueRoutes = Router();
const queueManager = QueueManager.getInstance();

// Get all queues with their statistics
queueRoutes.get('/', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const liveStats = await queueManager.getQueueStats();
  const dbStats = await QueueModel.find({}).sort({ name: 1 });

  // Merge live stats with database stats
  const queues = Object.values(QueueManager.QUEUES).map(queueName => {
    const live = liveStats[queueName] || {};
    const db = dbStats.find(q => q.name === queueName);

    return {
      name: queueName,
      description: db?.description,
      isActive: db?.isActive ?? true,
      liveStats: live,
      healthStatus: db?.healthStatus || 'unknown',
      processingRate: db?.processingRate || 0,
      averageProcessingTime: db?.averageProcessingTime || 0,
      lastProcessedAt: db?.lastProcessedAt,
      lastHealthCheck: db?.lastHealthCheck,
      configuration: db?.configuration || {
        concurrency: 5,
        retryAttempts: 3,
        retryDelay: 2000,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    };
  });

  res.json({
    success: true,
    data: queues,
  });
}));

// Get specific queue details
queueRoutes.get('/:queueName', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const liveStats = await queueManager.getQueueStats(queueName);
  const dbStats = await QueueModel.findOne({ name: queueName });

  // Get recent jobs for this queue
  const recentJobs = await JobModel.find({ queue: queueName })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('jobId type status createdAt completedAt processingTime error');

  // Get job type distribution
  const jobTypeStats = await JobModel.aggregate([
    { $match: { queue: queueName } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
        avgProcessingTime: { $avg: '$processingTime' },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      name: queueName,
      description: dbStats?.description,
      isActive: dbStats?.isActive ?? true,
      liveStats: liveStats[queueName] || {},
      healthStatus: dbStats?.healthStatus || 'unknown',
      processingRate: dbStats?.processingRate || 0,
      averageProcessingTime: dbStats?.averageProcessingTime || 0,
      lastProcessedAt: dbStats?.lastProcessedAt,
      lastHealthCheck: dbStats?.lastHealthCheck,
      configuration: dbStats?.configuration || {
        concurrency: 5,
        retryAttempts: 3,
        retryDelay: 2000,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      recentJobs,
      jobTypeStats: jobTypeStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          completed: stat.completed,
          failed: stat.failed,
          avgProcessingTime: stat.avgProcessingTime || 0,
          successRate: stat.count > 0 ? (stat.completed / stat.count) * 100 : 0,
        };
        return acc;
      }, {}),
    },
  });
}));

// Get queue jobs with pagination
queueRoutes.get('/:queueName/jobs', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const filter: any = { queue: queueName };
  
  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Filter by job type
  if (req.query.type) {
    filter.type = req.query.type;
  }

  // Filter by user
  if (req.query.userId) {
    filter.userId = req.query.userId;
  }

  // Date range filter
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) {
      filter.createdAt.$gte = new Date(req.query.from as string);
    }
    if (req.query.to) {
      filter.createdAt.$lte = new Date(req.query.to as string);
    }
  }

  const [jobs, total] = await Promise.all([
    JobModel.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .select('-data'), // Exclude potentially large data field
    JobModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  });
}));

// Pause/Resume a queue
queueRoutes.post('/:queueName/pause', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  // Note: Bull queue pause/resume would need to be implemented in QueueManager
  // For now, we'll update the database status
  await QueueModel.findOneAndUpdate(
    { name: queueName },
    { isActive: false },
    { upsert: true }
  );

  res.json({
    success: true,
    message: `Queue ${queueName} paused`,
  });
}));

queueRoutes.post('/:queueName/resume', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  await QueueModel.findOneAndUpdate(
    { name: queueName },
    { isActive: true },
    { upsert: true }
  );

  res.json({
    success: true,
    message: `Queue ${queueName} resumed`,
  });
}));

// Clean queue (remove completed/failed jobs)
queueRoutes.post('/:queueName/clean', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;
  const { olderThan = 24 * 60 * 60 * 1000, status = 'completed' } = req.body; // Default 24 hours

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const cutoffDate = new Date(Date.now() - olderThan);
  const filter: any = { 
    queue: queueName, 
    createdAt: { $lt: cutoffDate } 
  };

  if (status === 'completed') {
    filter.status = 'completed';
  } else if (status === 'failed') {
    filter.status = 'failed';
  } else if (status === 'all') {
    filter.status = { $in: ['completed', 'failed'] };
  }

  const result = await JobModel.deleteMany(filter);

  res.json({
    success: true,
    data: {
      deletedCount: result.deletedCount,
      status: status,
      olderThan: `${olderThan / (60 * 60 * 1000)} hours`,
    },
  });
}));

// Get queue performance metrics
queueRoutes.get('/:queueName/metrics', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;
  const hours = parseInt(req.query.hours as string) || 24;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get hourly metrics
  const hourlyMetrics = await JobModel.aggregate([
    {
      $match: {
        queue: queueName,
        createdAt: { $gte: startTime },
      },
    },
    {
      $group: {
        _id: {
          hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
          status: '$status',
        },
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTime' },
      },
    },
    {
      $group: {
        _id: '$_id.hour',
        metrics: {
          $push: {
            status: '$_id.status',
            count: '$count',
            avgProcessingTime: '$avgProcessingTime',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Get overall metrics for the time period
  const overallMetrics = await JobModel.aggregate([
    {
      $match: {
        queue: queueName,
        createdAt: { $gte: startTime },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTime' },
        minProcessingTime: { $min: '$processingTime' },
        maxProcessingTime: { $max: '$processingTime' },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      timeRange: {
        from: startTime,
        to: new Date(),
        hours,
      },
      hourlyMetrics: hourlyMetrics.map(h => ({
        hour: h._id,
        ...h.metrics.reduce((acc: any, m: any) => {
          acc[m.status] = {
            count: m.count,
            avgProcessingTime: m.avgProcessingTime || 0,
          };
          return acc;
        }, {}),
      })),
      overallMetrics: overallMetrics.reduce((acc, m) => {
        acc[m._id] = {
          count: m.count,
          avgProcessingTime: m.avgProcessingTime || 0,
          minProcessingTime: m.minProcessingTime || 0,
          maxProcessingTime: m.maxProcessingTime || 0,
        };
        return acc;
      }, {}),
    },
  });
}));

// Update queue configuration
queueRoutes.put('/:queueName/config', asyncHandler(async (req, res) => {
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  const { queueName } = req.params;
  const { description, configuration } = req.body;

  if (!Object.values(QueueManager.QUEUES).includes(queueName as any)) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const updateData: any = {};
  
  if (description !== undefined) {
    updateData.description = description;
  }
  
  if (configuration) {
    updateData.configuration = {
      concurrency: configuration.concurrency || 5,
      retryAttempts: configuration.retryAttempts || 3,
      retryDelay: configuration.retryDelay || 2000,
      removeOnComplete: configuration.removeOnComplete || 100,
      removeOnFail: configuration.removeOnFail || 50,
    };
  }

  const queue = await QueueModel.findOneAndUpdate(
    { name: queueName },
    updateData,
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    data: queue,
    message: 'Queue configuration updated',
  });
}));