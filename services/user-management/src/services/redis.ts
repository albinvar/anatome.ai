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

  // Session management
  async setSession(userId: string, token: string, expiresIn: number = 900): Promise<void> {
    const key = `session:${userId}:${token}`;
    await this.client.setEx(key, expiresIn, JSON.stringify({ userId, createdAt: new Date() }));
  }

  async getSession(userId: string, token: string): Promise<any> {
    const key = `session:${userId}:${token}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(userId: string, token: string): Promise<void> {
    const key = `session:${userId}:${token}`;
    await this.client.del(key);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    const pattern = `session:${userId}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  // Refresh token blacklist
  async blacklistToken(token: string, expiresIn: number = 604800): Promise<void> {
    const key = `blacklist:${token}`;
    await this.client.setEx(key, expiresIn, '1');
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  // Rate limiting
  async checkRateLimit(identifier: string, limit: number = 10, window: number = 60): Promise<boolean> {
    const key = `ratelimit:${identifier}`;
    const current = await this.client.incr(key);
    
    if (current === 1) {
      await this.client.expire(key, window);
    }
    
    return current <= limit;
  }

  // Cache management
  async setCache(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.client.setEx(`cache:${key}`, ttl, JSON.stringify(value));
  }

  async getCache(key: string): Promise<any> {
    const data = await this.client.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteCache(key: string): Promise<void> {
    await this.client.del(`cache:${key}`);
  }

  async flushCache(pattern: string): Promise<void> {
    const keys = await this.client.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}