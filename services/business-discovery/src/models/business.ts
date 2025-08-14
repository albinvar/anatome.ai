import mongoose, { Schema, Document } from 'mongoose';
import { Business } from '@anatome-ai/types';
import { BaseSchema } from '@anatome-ai/utils';

export interface IBusiness extends Document, Omit<Business, 'id'> {
  userId: string;
  competitors?: string[];
  discoveryStatus: 'pending' | 'discovering' | 'completed' | 'failed';
  lastDiscoveryAt?: Date;
}

const businessSchema = new Schema<IBusiness>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
  },
  location: {
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90,
      },
      lng: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
  },
  industry: {
    type: String,
    required: true,
  },
  website: {
    type: String,
  },
  competitors: [{
    type: Schema.Types.ObjectId,
    ref: 'Business',
  }],
  discoveryStatus: {
    type: String,
    enum: ['pending', 'discovering', 'completed', 'failed'],
    default: 'pending',
  },
  lastDiscoveryAt: Date,
}, BaseSchema);

// Indexes
businessSchema.index({ 'location.coordinates': '2dsphere' });
businessSchema.index({ userId: 1, createdAt: -1 });
businessSchema.index({ industry: 1 });
businessSchema.index({ 'location.city': 1, 'location.state': 1 });

// Virtual for full address
businessSchema.virtual('fullAddress').get(function() {
  const loc = this.location;
  return `${loc.address}, ${loc.city}, ${loc.state}, ${loc.country}`;
});

export const BusinessModel = mongoose.model<IBusiness>('Business', businessSchema);