import Bull from 'bull';
import { Logger } from '@anatome-ai/utils';
import { SocialProfileModel } from '../models/socialProfile';
import { SerperService } from './serper';
import { ReelAnalyzer } from './reelAnalyzer';
import { RedisClient } from './redis';
import axios from 'axios';

export class QueueService {
  private static instance: QueueService;
  private detectionQueue: Bull.Queue;
  private scrapingQueue: Bull.Queue;
  private logger: Logger;
  private serper: SerperService;
  private reelAnalyzer: ReelAnalyzer;
  private redis: RedisClient;

  private constructor() {
    this.logger = new Logger('queue-service');
    this.serper = SerperService.getInstance();
    this.reelAnalyzer = ReelAnalyzer.getInstance();
    this.redis = RedisClient.getInstance();
    
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    this.detectionQueue = new Bull('instagram-detection', {
      redis: redisConfig,
    });

    this.scrapingQueue = new Bull('video-scraping-jobs', {
      redis: redisConfig,
    });

    this.setupProcessors();
  }

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async initialize(): Promise<void> {
    this.logger.info('Instagram Detection queue service initialized');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.detectionQueue.isReady();
      return true;
    } catch {
      return false;
    }
  }

  private setupProcessors(): void {
    // Process Instagram profile detection
    this.detectionQueue.process('detect-instagram-profiles', async (job) => {
      const { businessId, businessName, location, keywords } = job.data;
      
      try {
        this.logger.info(`Detecting Instagram profiles for business: ${businessName}`);
        
        // Check if detection is already in progress
        const lockAcquired = await this.redis.acquireDetectionLock(businessId);
        if (!lockAcquired) {
          throw new Error('Detection already in progress for this business');
        }

        try {
          // Search for Instagram profiles using Serper
          const profiles = await this.serper.findInstagramProfiles({
            businessName,
            location,
            keywords,
          });

          const detectedProfiles = [];

          // Process each found profile
          for (const profile of profiles) {
            if (profile.confidence > 0.5) { // Only high-confidence matches
              // Validate the profile exists and is accessible
              const validation = await this.serper.validateInstagramProfile(profile.username);
              
              if (validation.exists && validation.isPublic) {
                // Create or update social profile record
                const socialProfile = await this.createOrUpdateSocialProfile(
                  businessId,
                  profile,
                  validation
                );

                if (socialProfile) {
                  detectedProfiles.push(socialProfile);
                  
                  // Queue reel analysis for this profile
                  await this.queueReelAnalysis(socialProfile._id.toString(), profile.username);
                }
              }
            }
          }

          await this.redis.incrementDetectionCounter('success');
          await this.redis.incrementDetectionCounter('total');

          this.logger.info(`Detected ${detectedProfiles.length} Instagram profiles for ${businessName}`);
          
          return {
            businessId,
            detectedProfiles: detectedProfiles.length,
            profiles: detectedProfiles,
          };

        } finally {
          await this.redis.releaseDetectionLock(businessId);
        }
        
      } catch (error) {
        this.logger.error(`Failed to detect Instagram profiles for business ${businessId}:`, error);
        await this.redis.incrementDetectionCounter('failure');
        await this.redis.incrementDetectionCounter('total');
        throw error;
      }
    });

    // Process reel analysis for detected profiles
    this.detectionQueue.process('analyze-instagram-reels', async (job) => {
      const { profileId, username } = job.data;
      
      try {
        this.logger.info(`Analyzing reels for Instagram profile: ${username}`);

        // Check rate limiting
        const rateLimitOk = await this.redis.checkRateLimit(username, 5, 3600); // 5 requests per hour
        if (!rateLimitOk) {
          throw new Error('Rate limit exceeded for Instagram analysis');
        }

        // Get social profile from database
        const socialProfile = await SocialProfileModel.findById(profileId);
        if (!socialProfile) {
          throw new Error('Social profile not found');
        }

        // Check if we have cached results
        const cached = await this.redis.getCachedReelAnalysis(profileId);
        if (cached && cached.length > 0) {
          this.logger.info(`Using cached reel analysis for ${username}`);
          return { profileId, reels: cached.length, cached: true };
        }

        // Update status to processing
        socialProfile.detectionStatus = 'processing';
        await socialProfile.save();

        // Analyze the Instagram profile for reels
        const reelMetadata = await this.reelAnalyzer.analyzeInstagramProfile(username);
        
        if (reelMetadata.length === 0) {
          this.logger.warn(`No reels found for ${username}`);
          socialProfile.detectionStatus = 'completed';
          await socialProfile.save();
          return { profileId, reels: 0 };
        }

        // Identify top performing reels
        const topReels = await this.reelAnalyzer.identifyTopReels(
          reelMetadata,
          parseInt(process.env.TOP_REELS_COUNT || '10')
        );

        // Update social profile with top reels
        socialProfile.topReels = topReels.map(reel => ({
          postId: reel.postId,
          url: reel.url,
          likes: reel.likes,
          comments: reel.comments,
          views: reel.views,
          engagementRate: reel.engagementRate,
          publishedAt: reel.publishedAt,
          thumbnail: reel.thumbnail,
          duration: reel.duration,
          rank: reel.rank,
        }));

        socialProfile.detectionStatus = 'completed';
        socialProfile.lastDetectionAt = new Date();
        await socialProfile.save();

        // Cache the results
        await this.redis.cacheReelAnalysis(profileId, topReels);

        // Queue video scraping for top reels
        await this.queueVideoScraping(profileId, topReels);

        this.logger.info(`Analyzed ${topReels.length} top reels for ${username}`);
        
        return {
          profileId,
          reels: topReels.length,
          topReels,
        };
        
      } catch (error) {
        this.logger.error(`Failed to analyze reels for profile ${profileId}:`, error);
        
        // Update status to failed
        await SocialProfileModel.findByIdAndUpdate(profileId, {
          detectionStatus: 'failed',
        });
        
        throw error;
      }
    });

    // Handle job events
    this.detectionQueue.on('completed', (job, result) => {
      this.logger.info(`Detection job ${job.id} completed:`, result);
    });

    this.detectionQueue.on('failed', (job, err) => {
      this.logger.error(`Detection job ${job.id} failed:`, err);
    });
  }

  private async createOrUpdateSocialProfile(
    businessId: string,
    profile: any,
    validation: any
  ) {
    try {
      // Check if profile already exists
      let socialProfile = await SocialProfileModel.findOne({
        businessId,
        username: profile.username,
        platform: 'instagram',
      });

      if (socialProfile) {
        // Update existing profile
        socialProfile.verified = validation.verified || false;
        socialProfile.followers = validation.followers || 0;
        socialProfile.posts = validation.posts || 0;
        socialProfile.profileUrl = profile.profileUrl;
      } else {
        // Create new profile
        socialProfile = new SocialProfileModel({
          businessId,
          platform: 'instagram',
          username: profile.username,
          profileUrl: profile.profileUrl,
          verified: validation.verified || false,
          followers: validation.followers || 0,
          following: 0,
          posts: validation.posts || 0,
          detectionStatus: 'pending',
        });
      }

      await socialProfile.save();
      return socialProfile;
      
    } catch (error) {
      this.logger.error('Failed to create/update social profile:', error);
      return null;
    }
  }

  async queueInstagramDetection(
    businessId: string,
    businessName: string,
    location?: string,
    keywords?: string[]
  ): Promise<void> {
    await this.detectionQueue.add(
      'detect-instagram-profiles',
      {
        businessId,
        businessName,
        location,
        keywords,
      },
      {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
  }

  async queueReelAnalysis(profileId: string, username: string): Promise<void> {
    await this.detectionQueue.add(
      'analyze-instagram-reels',
      {
        profileId,
        username,
      },
      {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        delay: 5000, // Wait 5 seconds before starting
      }
    );
  }

  private async queueVideoScraping(profileId: string, topReels: any[]): Promise<void> {
    try {
      // Queue each top reel for video scraping
      for (const reel of topReels) {
        await this.scrapingQueue.add(
          'scrape-instagram-video',
          {
            profileId,
            videoUrl: reel.url,
            postId: reel.postId,
            priority: reel.rank, // Higher rank = higher priority
            metadata: {
              likes: reel.likes,
              comments: reel.comments,
              views: reel.views,
              engagementRate: reel.engagementRate,
              publishedAt: reel.publishedAt,
            },
          },
          {
            priority: 10 - reel.rank, // Bull uses higher numbers for higher priority
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
      }

      this.logger.info(`Queued ${topReels.length} videos for scraping from profile ${profileId}`);
    } catch (error) {
      this.logger.error('Failed to queue video scraping:', error);
    }
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.detectionQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.detectionQueue.getWaitingCount(),
      this.detectionQueue.getActiveCount(),
      this.detectionQueue.getCompletedCount(),
      this.detectionQueue.getFailedCount(),
    ]);

    return {
      detection: { waiting, active, completed, failed },
      scraping: {
        waiting: await this.scrapingQueue.getWaitingCount(),
        active: await this.scrapingQueue.getActiveCount(),
      },
    };
  }
}