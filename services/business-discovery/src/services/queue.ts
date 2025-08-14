import Bull from 'bull';
import { Logger } from '@anatome-ai/utils';
import { SerperService } from './serper';
import { BusinessModel } from '../models/business';

export class QueueService {
  private static instance: QueueService;
  private discoveryQueue: Bull.Queue;
  private logger: Logger;
  private serper: SerperService;

  private constructor() {
    this.logger = new Logger('queue-service');
    this.serper = SerperService.getInstance();
    
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    this.discoveryQueue = new Bull('business-discovery', {
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
    this.logger.info('Queue service initialized');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.discoveryQueue.isReady();
      return true;
    } catch {
      return false;
    }
  }

  private setupProcessors(): void {
    // Process business discovery jobs
    this.discoveryQueue.process('discover-competitors', async (job) => {
      const { businessId, radius } = job.data;
      
      try {
        this.logger.info(`Starting competitor discovery for business ${businessId}`);
        
        // Get business details
        const business = await BusinessModel.findById(businessId);
        if (!business) {
          throw new Error('Business not found');
        }

        // Update status
        business.discoveryStatus = 'discovering';
        await business.save();

        // Search for competitors
        const competitors = await this.serper.searchCompetitors(
          {
            name: business.name,
            type: business.type,
            location: business.location,
            industry: business.industry,
          },
          radius
        );

        // Create competitor business records
        const competitorIds = [];
        for (const competitor of competitors) {
          const existingBusiness = await BusinessModel.findOne({
            name: competitor.name,
            'location.city': business.location.city,
          });

          if (!existingBusiness) {
            const newCompetitor = new BusinessModel({
              userId: business.userId,
              name: competitor.name,
              type: business.type,
              location: {
                ...business.location,
                address: competitor.address || business.location.address,
              },
              industry: business.industry,
              website: competitor.website,
              discoveryStatus: 'completed',
            });

            await newCompetitor.save();
            competitorIds.push(newCompetitor._id);

            // Queue Instagram detection job
            await this.queueInstagramDetection(newCompetitor._id.toString(), competitor.name);
          } else {
            competitorIds.push(existingBusiness._id);
          }
        }

        // Update business with competitors
        business.competitors = competitorIds;
        business.discoveryStatus = 'completed';
        business.lastDiscoveryAt = new Date();
        await business.save();

        this.logger.info(`Discovered ${competitorIds.length} competitors for business ${businessId}`);
        
        return { competitorIds, count: competitorIds.length };
      } catch (error) {
        this.logger.error(`Failed to discover competitors for business ${businessId}:`, error);
        
        // Update status to failed
        await BusinessModel.findByIdAndUpdate(businessId, {
          discoveryStatus: 'failed',
        });
        
        throw error;
      }
    });

    // Process business enrichment jobs
    this.discoveryQueue.process('enrich-business', async (job) => {
      const { businessId } = job.data;
      
      try {
        this.logger.info(`Enriching business ${businessId}`);
        
        const business = await BusinessModel.findById(businessId);
        if (!business) {
          throw new Error('Business not found');
        }

        // Get additional details from Serper
        const details = await this.serper.getBusinessDetails(
          business.name,
          `${business.location.city}, ${business.location.state}`
        );

        if (details) {
          // Update business with enriched data
          if (details.website && !business.website) {
            business.website = details.website;
          }
          
          if (details.address && !business.location.address) {
            business.location.address = details.address;
          }

          await business.save();
        }

        return { enriched: true, details };
      } catch (error) {
        this.logger.error(`Failed to enrich business ${businessId}:`, error);
        throw error;
      }
    });

    // Handle job events
    this.discoveryQueue.on('completed', (job, result) => {
      this.logger.info(`Job ${job.id} completed:`, result);
    });

    this.discoveryQueue.on('failed', (job, err) => {
      this.logger.error(`Job ${job.id} failed:`, err);
    });
  }

  async queueCompetitorDiscovery(businessId: string, radius: number = 50): Promise<void> {
    await this.discoveryQueue.add(
      'discover-competitors',
      { businessId, radius },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );
  }

  async queueBusinessEnrichment(businessId: string): Promise<void> {
    await this.discoveryQueue.add(
      'enrich-business',
      { businessId },
      {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      }
    );
  }

  private async queueInstagramDetection(businessId: string, businessName: string): Promise<void> {
    // This would normally queue to the Instagram Detection service
    // For now, we'll just log it
    this.logger.info(`Queuing Instagram detection for ${businessName} (${businessId})`);
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.discoveryQueue.getJob(jobId);
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
      this.discoveryQueue.getWaitingCount(),
      this.discoveryQueue.getActiveCount(),
      this.discoveryQueue.getCompletedCount(),
      this.discoveryQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }
}