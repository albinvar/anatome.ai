import { Logger } from '@anatome-ai/utils';
import { spawn } from 'child_process';
import * as path from 'path';

interface ReelMetadata {
  postId: string;
  url: string;
  likes: number;
  comments: number;
  views?: number;
  publishedAt: Date;
  caption: string;
  duration?: number;
  isReel: boolean;
  thumbnail?: string;
}

interface RankedReel extends ReelMetadata {
  engagementRate: number;
  performanceScore: number;
  rank: number;
}

export class ReelAnalyzer {
  private static instance: ReelAnalyzer;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('reel-analyzer');
  }

  static getInstance(): ReelAnalyzer {
    if (!ReelAnalyzer.instance) {
      ReelAnalyzer.instance = new ReelAnalyzer();
    }
    return ReelAnalyzer.instance;
  }

  async analyzeInstagramProfile(username: string): Promise<ReelMetadata[]> {
    try {
      this.logger.info(`Analyzing Instagram profile: ${username}`);
      
      // Use instaloader to get profile metadata
      const reels = await this.extractReelMetadata(username);
      
      this.logger.info(`Found ${reels.length} reels for ${username}`);
      return reels;
      
    } catch (error) {
      this.logger.error(`Failed to analyze profile ${username}:`, error);
      throw error;
    }
  }

  async identifyTopReels(
    reels: ReelMetadata[], 
    topN: number = parseInt(process.env.TOP_REELS_COUNT || '10'),
    minEngagement: number = 0.01
  ): Promise<RankedReel[]> {
    try {
      // Calculate engagement rates and performance scores
      const rankedReels = reels.map(reel => {
        const engagementRate = this.calculateEngagementRate(reel);
        const performanceScore = this.calculatePerformanceScore(reel);
        
        return {
          ...reel,
          engagementRate,
          performanceScore,
          rank: 0, // Will be set after sorting
        };
      });

      // Filter by minimum engagement
      const filteredReels = rankedReels.filter(reel => 
        reel.engagementRate >= minEngagement
      );

      // Sort by performance score (combination of engagement and recency)
      const sortedReels = filteredReels.sort((a, b) => 
        b.performanceScore - a.performanceScore
      );

      // Assign ranks and return top N
      const topReels = sortedReels
        .slice(0, topN)
        .map((reel, index) => ({
          ...reel,
          rank: index + 1,
        }));

      this.logger.info(`Identified ${topReels.length} top reels from ${reels.length} total`);
      
      return topReels;
      
    } catch (error) {
      this.logger.error('Failed to identify top reels:', error);
      throw error;
    }
  }

  private async extractReelMetadata(username: string): Promise<ReelMetadata[]> {
    return new Promise((resolve, reject) => {
      const reels: ReelMetadata[] = [];
      
      // Use instaloader to extract metadata only (no downloads)
      const pythonScript = path.join(__dirname, '../python/extract_reels.py');
      const process = spawn('python', [pythonScript, username]);
      
      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Python script failed: ${errorOutput}`);
          reject(new Error(`Instaloader process failed with code ${code}`));
          return;
        }

        try {
          // Parse the JSON output from the Python script
          const lines = output.trim().split('\n');
          const jsonLines = lines.filter(line => line.startsWith('{'));
          
          for (const line of jsonLines) {
            const reelData = JSON.parse(line);
            reels.push(this.formatReelMetadata(reelData));
          }
          
          resolve(reels);
        } catch (parseError) {
          this.logger.error('Failed to parse reel metadata:', parseError);
          reject(parseError);
        }
      });

      process.on('error', (error) => {
        this.logger.error('Failed to start Python process:', error);
        reject(error);
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          reject(new Error('Reel extraction timeout'));
        }
      }, 120000);
    });
  }

  private formatReelMetadata(rawData: any): ReelMetadata {
    return {
      postId: rawData.shortcode,
      url: `https://instagram.com/p/${rawData.shortcode}/`,
      likes: rawData.likes || 0,
      comments: rawData.comments || 0,
      views: rawData.video_view_count,
      publishedAt: new Date(rawData.date_utc || rawData.date),
      caption: rawData.caption || '',
      duration: rawData.video_duration,
      isReel: rawData.is_video && (rawData.video_duration <= 90), // Reels are typically ≤90 seconds
      thumbnail: rawData.display_url,
    };
  }

  private calculateEngagementRate(reel: ReelMetadata): number {
    // Basic engagement rate calculation
    const totalEngagement = reel.likes + reel.comments;
    
    // If we have view count, use it; otherwise estimate based on followers
    const views = reel.views || (reel.likes * 10); // Rough estimate
    
    if (views === 0) return 0;
    
    return totalEngagement / views;
  }

  private calculatePerformanceScore(reel: ReelMetadata): number {
    const engagementRate = this.calculateEngagementRate(reel);
    const recencyScore = this.calculateRecencyScore(reel.publishedAt);
    const contentScore = this.calculateContentScore(reel);
    
    // Weighted combination of factors
    return (
      engagementRate * 0.5 +      // 50% engagement
      recencyScore * 0.3 +        // 30% recency
      contentScore * 0.2          // 20% content factors
    );
  }

  private calculateRecencyScore(publishedAt: Date): number {
    const now = new Date();
    const daysDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Score decreases with age, but not linearly
    if (daysDiff <= 7) return 1.0;       // Past week: full score
    if (daysDiff <= 30) return 0.8;      // Past month: high score
    if (daysDiff <= 90) return 0.5;      // Past 3 months: medium score
    if (daysDiff <= 180) return 0.3;     // Past 6 months: low score
    return 0.1;                          // Older: minimal score
  }

  private calculateContentScore(reel: ReelMetadata): number {
    let score = 0.5; // Base score
    
    // Reels typically perform better than regular videos
    if (reel.isReel) {
      score += 0.2;
    }
    
    // Duration sweet spot (15-30 seconds typically perform well)
    if (reel.duration) {
      if (reel.duration >= 15 && reel.duration <= 30) {
        score += 0.2;
      } else if (reel.duration >= 7 && reel.duration <= 60) {
        score += 0.1;
      }
    }
    
    // Caption engagement indicators
    if (reel.caption) {
      const caption = reel.caption.toLowerCase();
      
      // Engagement prompts
      const engagementWords = ['comment', 'like', 'share', 'tag', 'follow', 'save'];
      if (engagementWords.some(word => caption.includes(word))) {
        score += 0.1;
      }
      
      // Trending hashtags/keywords
      const trendingWords = ['viral', 'trending', 'challenge', 'tutorial', 'tips'];
      if (trendingWords.some(word => caption.includes(word))) {
        score += 0.1;
      }
    }
    
    return Math.min(1.0, score);
  }

  async getReelAnalytics(reels: RankedReel[]): Promise<{
    totalReels: number;
    averageEngagement: number;
    topPerformer: RankedReel | null;
    engagementTrend: 'up' | 'down' | 'stable';
    contentTypes: { [key: string]: number };
  }> {
    if (reels.length === 0) {
      return {
        totalReels: 0,
        averageEngagement: 0,
        topPerformer: null,
        engagementTrend: 'stable',
        contentTypes: {},
      };
    }

    const totalReels = reels.length;
    const averageEngagement = reels.reduce((sum, reel) => 
      sum + reel.engagementRate, 0) / totalReels;
    
    const topPerformer = reels[0];
    
    // Simple engagement trend calculation
    const recentReels = reels.filter(reel => {
      const daysDiff = (new Date().getTime() - reel.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });
    
    const olderReels = reels.filter(reel => {
      const daysDiff = (new Date().getTime() - reel.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 30;
    });
    
    let engagementTrend: 'up' | 'down' | 'stable' = 'stable';
    if (recentReels.length > 0 && olderReels.length > 0) {
      const recentAvg = recentReels.reduce((sum, r) => sum + r.engagementRate, 0) / recentReels.length;
      const olderAvg = olderReels.reduce((sum, r) => sum + r.engagementRate, 0) / olderReels.length;
      
      if (recentAvg > olderAvg * 1.1) engagementTrend = 'up';
      else if (recentAvg < olderAvg * 0.9) engagementTrend = 'down';
    }

    // Categorize content types (simplified)
    const contentTypes: { [key: string]: number } = {};
    reels.forEach(reel => {
      const duration = reel.duration || 0;
      let type = 'unknown';
      
      if (duration <= 15) type = 'short';
      else if (duration <= 30) type = 'medium';
      else if (duration <= 60) type = 'long';
      
      contentTypes[type] = (contentTypes[type] || 0) + 1;
    });

    return {
      totalReels,
      averageEngagement,
      topPerformer,
      engagementTrend,
      contentTypes,
    };
  }
}