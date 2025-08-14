import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import { Logger } from '@anatome-ai/utils';
import { JobModel } from '../models/job';
import { QueueModel } from '../models/queue';
import axios from 'axios';

export interface JobData {
  id: string;
  type: string;
  payload: any;
  userId?: string;
  priority?: number;
  attempts?: number;
  delay?: number;
  timestamp: Date;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
}

export class QueueManager {
  private static instance: QueueManager;
  private logger: Logger;
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private processors: Map<string, Function> = new Map();

  // Queue Types
  public static readonly QUEUES = {
    BUSINESS_DISCOVERY: 'business-discovery',
    INSTAGRAM_DETECTION: 'instagram-detection',
    VIDEO_SCRAPING: 'video-scraping',
    VIDEO_ANALYSIS: 'video-analysis',
    REPORT_GENERATION: 'report-generation',
    FILE_PROCESSING: 'file-processing',
    CLEANUP: 'cleanup',
    NOTIFICATIONS: 'notifications',
  } as const;

  // Job Types
  public static readonly JOB_TYPES = {
    // Business Discovery
    DISCOVER_COMPETITORS: 'discover-competitors',
    DISCOVER_WITH_INSTAGRAM: 'discover-with-instagram',
    VALIDATE_BUSINESS: 'validate-business',
    
    // Instagram Detection
    DETECT_INSTAGRAM_PROFILES: 'detect-instagram-profiles',
    ANALYZE_REELS: 'analyze-reels',
    VALIDATE_INSTAGRAM_PROFILE: 'validate-instagram-profile',
    
    // Video Scraping
    SCRAPE_INSTAGRAM_VIDEOS: 'scrape-instagram-videos',
    DOWNLOAD_VIDEO: 'download-video',
    UPLOAD_TO_STORAGE: 'upload-to-storage',
    
    // Video Analysis
    ANALYZE_VIDEO_CONTENT: 'analyze-video-content',
    EXTRACT_METADATA: 'extract-metadata',
    GENERATE_INSIGHTS: 'generate-insights',
    
    // Report Generation
    GENERATE_COMPETITOR_REPORT: 'generate-competitor-report',
    GENERATE_TREND_ANALYSIS: 'generate-trend-analysis',
    EXPORT_PDF_REPORT: 'export-pdf-report',
    
    // File Processing
    PROCESS_VIDEO_UPLOAD: 'process-video-upload',
    CLEAN_TEMP_FILES: 'clean-temp-files',
    BACKUP_DATA: 'backup-data',
    
    // System
    SEND_NOTIFICATION: 'send-notification',
    HEALTH_CHECK_SERVICES: 'health-check-services',
    CLEANUP_EXPIRED_JOBS: 'cleanup-expired-jobs',
  } as const;

  private constructor() {
    this.logger = new Logger('queue-manager');
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });

    this.setupEventHandlers();
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Queue Manager...');

    // Initialize all queues
    for (const queueName of Object.values(QueueManager.QUEUES)) {
      await this.createQueue(queueName);
    }

    // Setup job processors
    this.setupProcessors();

    this.logger.info('Queue Manager initialized successfully');
  }

  private async createQueue(name: string): Promise<Queue> {
    const queue = new Bull(name, {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.queues.set(name, queue);

    // Setup queue event handlers
    queue.on('completed', this.onJobCompleted.bind(this));
    queue.on('failed', this.onJobFailed.bind(this));
    queue.on('active', this.onJobActive.bind(this));
    queue.on('stalled', this.onJobStalled.bind(this));

    this.logger.info(`Queue '${name}' created successfully`);
    return queue;
  }

  private setupProcessors(): void {
    // Business Discovery Processors
    this.addProcessor(QueueManager.QUEUES.BUSINESS_DISCOVERY, QueueManager.JOB_TYPES.DISCOVER_COMPETITORS, this.processDiscoverCompetitors.bind(this));
    this.addProcessor(QueueManager.QUEUES.BUSINESS_DISCOVERY, QueueManager.JOB_TYPES.DISCOVER_WITH_INSTAGRAM, this.processDiscoverWithInstagram.bind(this));

    // Instagram Detection Processors
    this.addProcessor(QueueManager.QUEUES.INSTAGRAM_DETECTION, QueueManager.JOB_TYPES.DETECT_INSTAGRAM_PROFILES, this.processDetectInstagramProfiles.bind(this));
    this.addProcessor(QueueManager.QUEUES.INSTAGRAM_DETECTION, QueueManager.JOB_TYPES.ANALYZE_REELS, this.processAnalyzeReels.bind(this));

    // Video Scraping Processors
    this.addProcessor(QueueManager.QUEUES.VIDEO_SCRAPING, QueueManager.JOB_TYPES.SCRAPE_INSTAGRAM_VIDEOS, this.processScrapeInstagramVideos.bind(this));
    this.addProcessor(QueueManager.QUEUES.VIDEO_SCRAPING, QueueManager.JOB_TYPES.DOWNLOAD_VIDEO, this.processDownloadVideo.bind(this));

    // Video Analysis Processors
    this.addProcessor(QueueManager.QUEUES.VIDEO_ANALYSIS, QueueManager.JOB_TYPES.ANALYZE_VIDEO_CONTENT, this.processAnalyzeVideoContent.bind(this));
    this.addProcessor(QueueManager.QUEUES.VIDEO_ANALYSIS, QueueManager.JOB_TYPES.GENERATE_INSIGHTS, this.processGenerateInsights.bind(this));

    // Report Generation Processors
    this.addProcessor(QueueManager.QUEUES.REPORT_GENERATION, QueueManager.JOB_TYPES.GENERATE_COMPETITOR_REPORT, this.processGenerateCompetitorReport.bind(this));

    // System Processors
    this.addProcessor(QueueManager.QUEUES.CLEANUP, QueueManager.JOB_TYPES.CLEANUP_EXPIRED_JOBS, this.processCleanupExpiredJobs.bind(this));
    this.addProcessor(QueueManager.QUEUES.NOTIFICATIONS, QueueManager.JOB_TYPES.SEND_NOTIFICATION, this.processSendNotification.bind(this));
  }

  private addProcessor(queueName: string, jobType: string, processor: Function): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const processorKey = `${queueName}:${jobType}`;
    this.processors.set(processorKey, processor);

    queue.process(jobType, 5, async (job: Job) => {
      const startTime = Date.now();
      
      try {
        this.logger.info(`Processing job ${job.id} of type ${jobType}`);
        const result = await processor(job);
        
        const processingTime = Date.now() - startTime;
        return { ...result, processingTime };
      } catch (error) {
        this.logger.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    });

    this.logger.info(`Processor registered for ${queueName}:${jobType}`);
  }

  // Job Processing Methods
  private async processDiscoverCompetitors(job: Job): Promise<JobResult> {
    const { businessId, businessData, radius, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.BUSINESS_DISCOVERY_SERVICE_URL || 'http://business-discovery:3001'}/discovery/competitors`,
        { businessId, ...businessData, radius },
        {
          headers: { 'x-user-id': userId },
          timeout: 120000,
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0, // Will be set by caller
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processDiscoverWithInstagram(job: Job): Promise<JobResult> {
    const { businessName, location, businessType, industry, radius, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.BUSINESS_DISCOVERY_SERVICE_URL || 'http://business-discovery:3001'}/discovery/discover-with-instagram`,
        { businessName, location, businessType, industry, radius },
        {
          headers: { 'x-user-id': userId },
          timeout: 300000, // 5 minutes for complete discovery flow
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processDetectInstagramProfiles(job: Job): Promise<JobResult> {
    const { businessId, businessName, location, keywords, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.INSTAGRAM_SERVICE_URL || 'http://instagram-detection:3003'}/detection/start`,
        { businessId, businessName, location, keywords },
        {
          headers: { 'x-user-id': userId },
          timeout: 180000,
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processAnalyzeReels(job: Job): Promise<JobResult> {
    const { profileId, username, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.INSTAGRAM_SERVICE_URL || 'http://instagram-detection:3003'}/instagram/profiles/${profileId}/analyze`,
        {},
        {
          headers: { 'x-user-id': userId },
          timeout: 300000, // 5 minutes for reel analysis
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processScrapeInstagramVideos(job: Job): Promise<JobResult> {
    const { profileId, username, topReels, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.VIDEO_SCRAPING_SERVICE_URL || 'http://video-scraping:8000'}/scraping/instagram`,
        { profileId, username, topReels },
        {
          headers: { 'x-user-id': userId },
          timeout: 600000, // 10 minutes for video scraping
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processDownloadVideo(job: Job): Promise<JobResult> {
    const { videoUrl, postId, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.VIDEO_SCRAPING_SERVICE_URL || 'http://video-scraping:8000'}/scraping/download`,
        { videoUrl, postId },
        {
          headers: { 'x-user-id': userId },
          timeout: 300000,
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processAnalyzeVideoContent(job: Job): Promise<JobResult> {
    const { videoId, videoPath, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.VIDEO_ANALYSIS_SERVICE_URL || 'http://video-analysis:3005'}/analysis/analyze`,
        { videoId, videoPath },
        {
          headers: { 'x-user-id': userId },
          timeout: 600000, // 10 minutes for AI analysis
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processGenerateInsights(job: Job): Promise<JobResult> {
    const { analysisIds, reportType, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.VIDEO_ANALYSIS_SERVICE_URL || 'http://video-analysis:3005'}/analysis/insights`,
        { analysisIds, reportType },
        {
          headers: { 'x-user-id': userId },
          timeout: 300000,
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processGenerateCompetitorReport(job: Job): Promise<JobResult> {
    const { businessId, competitorIds, analysisData, userId } = job.data;
    
    try {
      const response = await axios.post(
        `${process.env.REPORT_SERVICE_URL || 'http://report-generation:3006'}/reports/competitor`,
        { businessId, competitorIds, analysisData },
        {
          headers: { 'x-user-id': userId },
          timeout: 600000, // 10 minutes for report generation
        }
      );

      return {
        success: true,
        data: response.data,
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processCleanupExpiredJobs(job: Job): Promise<JobResult> {
    try {
      const expiryDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
      
      const result = await JobModel.deleteMany({
        createdAt: { $lt: expiryDate },
        status: { $in: ['completed', 'failed'] },
      });

      return {
        success: true,
        data: { deletedCount: result.deletedCount },
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  private async processSendNotification(job: Job): Promise<JobResult> {
    const { userId, type, title, message, data } = job.data;
    
    try {
      // For now, just log the notification
      // In the future, integrate with email/push notification services
      this.logger.info(`Notification for user ${userId}: ${title} - ${message}`);
      
      return {
        success: true,
        data: { notificationSent: true },
        processingTime: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTime: 0,
      };
    }
  }

  // Public API Methods
  async addJob(
    queueName: string,
    jobType: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobData: JobData = {
      id: data.id || this.generateJobId(),
      type: jobType,
      payload: data,
      userId: data.userId,
      priority: data.priority || 0,
      attempts: options?.attempts || 3,
      delay: options?.delay || 0,
      timestamp: new Date(),
    };

    // Save job to database
    const jobDoc = new JobModel({
      jobId: jobData.id,
      queue: queueName,
      type: jobType,
      data: jobData.payload,
      userId: jobData.userId,
      status: 'waiting',
      attempts: 0,
      maxAttempts: jobData.attempts,
      priority: jobData.priority,
      delay: jobData.delay,
      createdAt: new Date(),
    });

    await jobDoc.save();

    const bullJob = await queue.add(jobType, jobData, {
      ...options,
      jobId: jobData.id,
    });

    this.logger.info(`Job ${jobData.id} added to queue '${queueName}'`);
    return bullJob;
  }

  async getJob(jobId: string): Promise<Job | null> {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) return job;
    }
    return null;
  }

  async getQueueStats(queueName?: string): Promise<any> {
    const stats: any = {};

    const queuesToCheck = queueName ? [queueName] : Array.from(this.queues.keys());

    for (const name of queuesToCheck) {
      const queue = this.queues.get(name);
      if (queue) {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed(),
        ]);

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length,
        };
      }
    }

    return queueName ? stats[queueName] : stats;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  private async onJobCompleted(job: Job, result: JobResult): Promise<void> {
    this.logger.info(`Job ${job.id} completed successfully`);
    
    await JobModel.findOneAndUpdate(
      { jobId: job.id },
      {
        status: 'completed',
        result,
        completedAt: new Date(),
        processingTime: result.processingTime,
      }
    );
  }

  private async onJobFailed(job: Job, error: Error): Promise<void> {
    this.logger.error(`Job ${job.id} failed:`, error);
    
    await JobModel.findOneAndUpdate(
      { jobId: job.id },
      {
        status: 'failed',
        error: error.message,
        failedAt: new Date(),
        attempts: job.attemptsMade,
      }
    );
  }

  private async onJobActive(job: Job): Promise<void> {
    this.logger.info(`Job ${job.id} started processing`);
    
    await JobModel.findOneAndUpdate(
      { jobId: job.id },
      {
        status: 'active',
        startedAt: new Date(),
      }
    );
  }

  private async onJobStalled(job: Job): Promise<void> {
    this.logger.warn(`Job ${job.id} stalled`);
    
    await JobModel.findOneAndUpdate(
      { jobId: job.id },
      {
        status: 'stalled',
        stalledAt: new Date(),
      }
    );
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Queue Manager...');
    
    await Promise.all(
      Array.from(this.queues.values()).map(queue => queue.close())
    );
    
    await this.redis.disconnect();
    this.logger.info('Queue Manager shutdown complete');
  }
}