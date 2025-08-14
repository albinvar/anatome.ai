import { createClient, RedisClientType } from 'redis';
import { Logger } from '@anatome-ai/utils';

export class RedisClient {
  private static instance: RedisClient;
  private client: RedisClientType;
  private logger: Logger;
  private isConnected: boolean = false;

  private constructor() {
    this.logger = new Logger('redis-client');
    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.logger.info('Redis client connected');
      this.isConnected = true;
    });
  }

  static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Cache Instagram profile data
  async cacheProfileData(username: string, data: any, ttl: number = 3600): Promise<void> {
    const key = `instagram:profile:${username}`;
    await this.client.setEx(key, ttl, JSON.stringify(data));
  }

  async getCachedProfileData(username: string): Promise<any> {
    const key = `instagram:profile:${username}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Cache reel analysis results
  async cacheReelAnalysis(profileId: string, reels: any[], ttl: number = 7200): Promise<void> {
    const key = `instagram:reels:${profileId}`;
    await this.client.setEx(key, ttl, JSON.stringify(reels));
  }

  async getCachedReelAnalysis(profileId: string): Promise<any[]> {
    const key = `instagram:reels:${profileId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Rate limiting for Instagram API calls
  async checkRateLimit(identifier: string, limit: number = 10, window: number = 3600): Promise<boolean> {
    const key = `ratelimit:instagram:${identifier}`;
    const current = await this.client.incr(key);
    
    if (current === 1) {
      await this.client.expire(key, window);
    }
    
    return current <= limit;
  }

  async getRateLimitInfo(identifier: string): Promise<{ current: number; limit: number; remaining: number; resetTime?: number }> {
    const key = `ratelimit:instagram:${identifier}`;
    const current = await this.client.get(key);
    const ttl = await this.client.ttl(key);
    
    const currentCount = current ? parseInt(current) : 0;
    const limit = 10; // Default limit
    
    return {
      current: currentCount,
      limit,
      remaining: Math.max(0, limit - currentCount),
      resetTime: ttl > 0 ? Date.now() + (ttl * 1000) : undefined,
    };
  }

  // Detection job tracking
  async setDetectionJob(profileId: string, jobData: any): Promise<void> {
    const key = `detection:job:${profileId}`;
    await this.client.setEx(key, 3600, JSON.stringify(jobData)); // 1 hour TTL
  }

  async getDetectionJob(profileId: string): Promise<any> {
    const key = `detection:job:${profileId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteDetectionJob(profileId: string): Promise<void> {
    const key = `detection:job:${profileId}`;
    await this.client.del(key);
  }

  // Lock mechanism for concurrent detection
  async acquireDetectionLock(profileId: string, ttl: number = 300): Promise<boolean> {
    const key = `detection:lock:${profileId}`;
    const result = await this.client.setNX(key, '1');
    
    if (result) {
      await this.client.expire(key, ttl);
      return true;
    }
    
    return false;
  }

  async releaseDetectionLock(profileId: string): Promise<void> {
    const key = `detection:lock:${profileId}`;
    await this.client.del(key);
  }

  // Statistics and monitoring
  async incrementDetectionCounter(type: 'success' | 'failure' | 'total'): Promise<void> {
    const key = `stats:detection:${type}`;
    await this.client.incr(key);
  }

  async getDetectionStats(): Promise<{ success: number; failure: number; total: number }> {
    const [success, failure, total] = await Promise.all([
      this.client.get('stats:detection:success'),
      this.client.get('stats:detection:failure'),
      this.client.get('stats:detection:total'),
    ]);

    return {
      success: success ? parseInt(success) : 0,
      failure: failure ? parseInt(failure) : 0,
      total: total ? parseInt(total) : 0,
    };
  }

  // Clear all detection-related cache
  async clearDetectionCache(pattern: string = 'detection:*'): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}