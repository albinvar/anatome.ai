import mongoose, { Schema, Document } from 'mongoose';
import { SocialProfile } from '@anatome-ai/types';
import { BaseSchema } from '@anatome-ai/utils';

export interface ISocialProfile extends Document, Omit<SocialProfile, 'id'> {
  businessId: string;
  detectionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  lastDetectionAt?: Date;
  topReels?: {
    postId: string;
    url: string;
    likes: number;
    comments: number;
    views?: number;
    engagementRate: number;
    publishedAt: Date;
    thumbnail?: string;
    duration?: number;
    rank: number;
  }[];
}

const socialProfileSchema = new Schema<ISocialProfile>({
  businessId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'tiktok'],
    required: true,
  },
  username: {
    type: String,
    required: true,
    trim: true,
  },
  profileUrl: {
    type: String,
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  followers: {
    type: Number,
    default: 0,
  },
  following: {
    type: Number,
    default: 0,
  },
  posts: {
    type: Number,
    default: 0,
  },
  lastScrapedAt: {
    type: Date,
  },
  detectionStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  lastDetectionAt: {
    type: Date,
  },
  topReels: [{
    postId: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    likes: {
      type: Number,
      default: 0,
    },
    comments: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
    },
    engagementRate: {
      type: Number,
      default: 0,
    },
    publishedAt: {
      type: Date,
      required: true,
    },
    thumbnail: {
      type: String,
    },
    duration: {
      type: Number,
    },
    rank: {
      type: Number,
      required: true,
    },
  }],
}, BaseSchema);

// Indexes
socialProfileSchema.index({ businessId: 1, platform: 1 });
socialProfileSchema.index({ username: 1, platform: 1 });
socialProfileSchema.index({ detectionStatus: 1 });
socialProfileSchema.index({ 'topReels.engagementRate': -1 });
socialProfileSchema.index({ lastDetectionAt: -1 });

// Virtual for engagement metrics
socialProfileSchema.virtual('averageEngagement').get(function() {
  if (!this.topReels || this.topReels.length === 0) return 0;
  const total = this.topReels.reduce((sum, reel) => sum + reel.engagementRate, 0);
  return total / this.topReels.length;
});

export const SocialProfileModel = mongoose.model<ISocialProfile>('SocialProfile', socialProfileSchema);