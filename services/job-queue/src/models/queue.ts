import mongoose, { Schema, Document } from 'mongoose';

export interface QueueStats {
  name: string;
  description?: string;
  isActive: boolean;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  waitingJobs: number;
  delayedJobs: number;
  processingRate: number; // jobs per minute
  averageProcessingTime: number; // milliseconds
  lastProcessedAt?: Date;
  configuration: {
    concurrency: number;
    retryAttempts: number;
    retryDelay: number;
    removeOnComplete: number;
    removeOnFail: number;
  };
  healthStatus: 'healthy' | 'warning' | 'error';
  lastHealthCheck: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IQueue extends Document, Omit<QueueStats, 'id'> {}

const queueSchema = new Schema<IQueue>({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  description: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  totalJobs: {
    type: Number,
    default: 0,
  },
  completedJobs: {
    type: Number,
    default: 0,
  },
  failedJobs: {
    type: Number,
    default: 0,
  },
  activeJobs: {
    type: Number,
    default: 0,
  },
  waitingJobs: {
    type: Number,
    default: 0,
  },
  delayedJobs: {
    type: Number,
    default: 0,
  },
  processingRate: {
    type: Number,
    default: 0,
  },
  averageProcessingTime: {
    type: Number,
    default: 0,
  },
  lastProcessedAt: {
    type: Date,
  },
  configuration: {
    concurrency: {
      type: Number,
      default: 5,
    },
    retryAttempts: {
      type: Number,
      default: 3,
    },
    retryDelay: {
      type: Number,
      default: 2000,
    },
    removeOnComplete: {
      type: Number,
      default: 100,
    },
    removeOnFail: {
      type: Number,
      default: 50,
    },
  },
  healthStatus: {
    type: String,
    enum: ['healthy', 'warning', 'error'],
    default: 'healthy',
    index: true,
  },
  lastHealthCheck: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
queueSchema.index({ isActive: 1, healthStatus: 1 });
queueSchema.index({ lastHealthCheck: 1 });
queueSchema.index({ processingRate: -1 });

export const QueueModel = mongoose.model<IQueue>('Queue', queueSchema);