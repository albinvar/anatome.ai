import mongoose from 'mongoose';
import { Logger } from './logger';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private logger: Logger;
  private isConnected: boolean = false;

  private constructor(serviceName: string) {
    this.logger = new Logger(serviceName);
  }

  static getInstance(serviceName: string): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(serviceName);
    }
    return DatabaseConnection.instance;
  }

  async connect(uri?: string): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/anatome-ai';

    try {
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      });

      this.isConnected = true;
      this.logger.info('MongoDB connected successfully');

      mongoose.connection.on('error', (error) => {
        this.logger.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        this.logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        this.logger.info('MongoDB reconnected');
        this.isConnected = true;
      });
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      this.logger.info('MongoDB disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getConnection(): mongoose.Connection {
    return mongoose.connection;
  }

  isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

export const createPaginationOptions = (page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  return { skip, limit };
};

export const createPaginationResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) => {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const createSortOptions = (sortBy?: string, sortOrder: 'asc' | 'desc' = 'desc') => {
  if (!sortBy) {
    return { createdAt: sortOrder === 'asc' ? 1 : -1 };
  }
  return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
};

export const BaseSchema = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
};