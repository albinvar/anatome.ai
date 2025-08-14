import { CronJob } from 'cron';
import { Logger } from '@anatome-ai/utils';
import { QueueManager } from './queueManager';
import { QueueModel } from '../models/queue';
import { JobModel } from '../models/job';

export class JobScheduler {
  private static instance: JobScheduler;
  private logger: Logger;
  private jobs: Map<string, CronJob> = new Map();
  private queueManager: QueueManager;

  private constructor() {
    this.logger = new Logger('job-scheduler');
    this.queueManager = QueueManager.getInstance();
  }

  static getInstance(): JobScheduler {
    if (!JobScheduler.instance) {
      JobScheduler.instance = new JobScheduler();
    }
    return JobScheduler.instance;
  }

  async start(): Promise<void> {
    this.logger.info('Starting Job Scheduler...');

    // Schedule recurring jobs
    this.scheduleRecurringJobs();

    this.logger.info('Job Scheduler started successfully');
  }

  private scheduleRecurringJobs(): void {
    // Cleanup expired jobs every day at 2 AM
    this.scheduleJob('cleanup-expired-jobs', '0 2 * * *', async () => {
      await this.queueManager.addJob(
        QueueManager.QUEUES.CLEANUP,
        QueueManager.JOB_TYPES.CLEANUP_EXPIRED_JOBS,
        { triggeredBy: 'scheduler' }
      );
    });

    // Health check services every 5 minutes
    this.scheduleJob('health-check-services', '*/5 * * * *', async () => {
      await this.performHealthChecks();
    });

    // Update queue statistics every minute
    this.scheduleJob('update-queue-stats', '* * * * *', async () => {
      await this.updateQueueStatistics();
    });

    // Process stalled jobs every 30 minutes
    this.scheduleJob('process-stalled-jobs', '*/30 * * * *', async () => {
      await this.processStalledJobs();
    });

    // Archive old completed jobs every week on Sunday at 3 AM
    this.scheduleJob('archive-old-jobs', '0 3 * * 0', async () => {
      await this.archiveOldJobs();
    });
  }

  private scheduleJob(name: string, cronExpression: string, task: () => Promise<void>): void {
    const job = new CronJob(
      cronExpression,
      async () => {
        try {
          this.logger.info(`Executing scheduled job: ${name}`);
          await task();
          this.logger.info(`Scheduled job completed: ${name}`);
        } catch (error) {
          this.logger.error(`Scheduled job failed: ${name}`, error);
        }
      },
      null,
      true,
      'America/New_York'
    );

    this.jobs.set(name, job);
    this.logger.info(`Scheduled job registered: ${name} (${cronExpression})`);
  }

  private async performHealthChecks(): Promise<void> {
    try {
      const queueNames = Object.values(QueueManager.QUEUES);
      
      for (const queueName of queueNames) {
        const stats = await this.queueManager.getQueueStats(queueName);
        const queueStats = stats[queueName];

        if (!queueStats) continue;

        let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';

        // Check for concerning patterns
        if (queueStats.failed > 10 && queueStats.failed > queueStats.completed * 0.1) {
          healthStatus = 'warning';
        }

        if (queueStats.failed > queueStats.completed) {
          healthStatus = 'error';
        }

        // Update or create queue document
        await QueueModel.findOneAndUpdate(
          { name: queueName },
          {
            name: queueName,
            totalJobs: queueStats.total,
            completedJobs: queueStats.completed,
            failedJobs: queueStats.failed,
            activeJobs: queueStats.active,
            waitingJobs: queueStats.waiting,
            delayedJobs: queueStats.delayed,
            healthStatus,
            lastHealthCheck: new Date(),
          },
          {
            upsert: true,
            new: true,
          }
        );
      }
    } catch (error) {
      this.logger.error('Health check failed:', error);
    }
  }

  private async updateQueueStatistics(): Promise<void> {
    try {
      const queueNames = Object.values(QueueManager.QUEUES);
      
      for (const queueName of queueNames) {
        // Calculate processing rate and average processing time
        const recentJobs = await JobModel.find({
          queue: queueName,
          status: 'completed',
          completedAt: {
            $gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        });

        const processingRate = recentJobs.length; // jobs per hour
        const averageProcessingTime = recentJobs.length > 0
          ? recentJobs.reduce((sum, job) => sum + (job.processingTime || 0), 0) / recentJobs.length
          : 0;

        const lastProcessed = recentJobs.length > 0
          ? recentJobs.sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0].completedAt
          : undefined;

        // Update queue statistics
        await QueueModel.findOneAndUpdate(
          { name: queueName },
          {
            processingRate,
            averageProcessingTime,
            lastProcessedAt: lastProcessed,
          },
          { upsert: true }
        );
      }
    } catch (error) {
      this.logger.error('Failed to update queue statistics:', error);
    }
  }

  private async processStalledJobs(): Promise<void> {
    try {
      const stalledJobs = await JobModel.find({
        status: 'stalled',
        stalledAt: {
          $lt: new Date(Date.now() - 30 * 60 * 1000), // Stalled for more than 30 minutes
        },
      });

      for (const job of stalledJobs) {
        this.logger.warn(`Processing stalled job: ${job.jobId}`);
        
        // Mark as failed if it has exceeded max attempts
        if (job.attempts >= job.maxAttempts) {
          job.status = 'failed';
          job.error = 'Job stalled and exceeded maximum retry attempts';
          job.failedAt = new Date();
        } else {
          // Reset to waiting to retry
          job.status = 'waiting';
          job.attempts += 1;
        }
        
        await job.save();
      }

      if (stalledJobs.length > 0) {
        this.logger.info(`Processed ${stalledJobs.length} stalled jobs`);
      }
    } catch (error) {
      this.logger.error('Failed to process stalled jobs:', error);
    }
  }

  private async archiveOldJobs(): Promise<void> {
    try {
      const archiveDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const result = await JobModel.deleteMany({
        status: { $in: ['completed', 'failed'] },
        createdAt: { $lt: archiveDate },
      });

      this.logger.info(`Archived ${result.deletedCount} old jobs`);
    } catch (error) {
      this.logger.error('Failed to archive old jobs:', error);
    }
  }

  // Public API methods
  async scheduleDelayedJob(
    queueName: string,
    jobType: string,
    data: any,
    delayMs: number
  ): Promise<void> {
    await this.queueManager.addJob(queueName, jobType, data, {
      delay: delayMs,
    });
  }

  async scheduleRepeatingJob(
    queueName: string,
    jobType: string,
    data: any,
    cronExpression: string
  ): Promise<void> {
    const jobName = `${queueName}-${jobType}-${Date.now()}`;
    
    this.scheduleJob(jobName, cronExpression, async () => {
      await this.queueManager.addJob(queueName, jobType, data);
    });
  }

  async cancelScheduledJob(jobName: string): Promise<boolean> {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      this.logger.info(`Cancelled scheduled job: ${jobName}`);
      return true;
    }
    return false;
  }

  getScheduledJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  async getSchedulerStats(): Promise<any> {
    const scheduledJobs = this.getScheduledJobs();
    
    const queueStats = await QueueModel.find({}, {
      name: 1,
      healthStatus: 1,
      processingRate: 1,
      totalJobs: 1,
      lastHealthCheck: 1,
    });

    return {
      scheduledJobsCount: scheduledJobs.length,
      scheduledJobs,
      queueHealth: queueStats,
      uptime: process.uptime(),
      lastHealthCheck: new Date(),
    };
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Job Scheduler...');
    
    for (const [name, job] of this.jobs.entries()) {
      job.stop();
      this.logger.info(`Stopped scheduled job: ${name}`);
    }
    
    this.jobs.clear();
    this.logger.info('Job Scheduler stopped');
  }
}