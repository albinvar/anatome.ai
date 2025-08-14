import mongoose, { Schema, Document } from 'mongoose';

export interface Job {
  jobId: string;
  queue: string;
  type: string;
  data: any;
  userId?: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'stalled';
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay: number;
  result?: any;
  error?: string;
  processingTime?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  stalledAt?: Date;
}

export interface IJob extends Document, Omit<Job, 'id'> {}

const jobSchema = new Schema<IJob>({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  queue: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    index: true,
  },
  data: {
    type: Schema.Types.Mixed,
    required: true,
  },
  userId: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed', 'failed', 'stalled'],
    default: 'waiting',
    index: true,
  },
  priority: {
    type: Number,
    default: 0,
    index: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },
  delay: {
    type: Number,
    default: 0,
  },
  result: {
    type: Schema.Types.Mixed,
  },
  error: {
    type: String,
  },
  processingTime: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  failedAt: {
    type: Date,
  },
  stalledAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
jobSchema.index({ queue: 1, status: 1 });
jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, createdAt: -1 });
jobSchema.index({ type: 1, status: 1 });
jobSchema.index({ createdAt: -1, status: 1 });

// TTL index for automatic cleanup of old completed jobs (30 days)
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const JobModel = mongoose.model<IJob>('Job', jobSchema);