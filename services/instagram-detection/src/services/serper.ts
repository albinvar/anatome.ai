import axios from 'axios';
import { Logger, ExternalServiceError } from '@anatome-ai/utils';

interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic: SerperSearchResult[];
  searchParameters: {
    q: string;
    location: string;
  };
}

export class SerperService {
  private static instance: SerperService;
  private logger: Logger;
  private apiKey: string;
  private baseUrl = 'https://google.serper.dev';

  private constructor() {
    this.logger = new Logger('serper-service');
    this.apiKey = process.env.SERPER_API_KEY || '';
    
    if (!this.apiKey) {
      this.logger.warn('Serper API key not configured');
    }
  }

  static getInstance(): SerperService {
    if (!SerperService.instance) {
      SerperService.instance = new SerperService();
    }
    return SerperService.instance;
  }

  async findInstagramProfiles(params: {
    businessName: string;
    location?: string;
    keywords?: string[];
  }): Promise<any[]> {
    try {
      // Build Instagram-specific search query
      const searchTerms = [
        `"${params.businessName}"`,
        'site:instagram.com',
        ...(params.keywords || [])
      ];

      if (params.location) {
        searchTerms.push(params.location);
      }

      const searchQuery = searchTerms.join(' ');
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          location: params.location || 'United States',
          num: 10,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      return this.parseInstagramResults(response.data.organic || []);
    } catch (error: any) {
      this.logger.error('Instagram profile search failed:', error);
      throw new ExternalServiceError('Serper', error);
    }
  }

  async searchInstagramContent(username: string, keywords?: string[]): Promise<any[]> {
    try {
      // Search for specific Instagram content
      const searchTerms = [
        `site:instagram.com/${username}`,
        '/p/', // Posts
        '/reel/', // Reels
        ...(keywords || [])
      ];

      const searchQuery = searchTerms.join(' ');
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          num: 20,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      return this.parseContentResults(response.data.organic || []);
    } catch (error: any) {
      this.logger.error('Instagram content search failed:', error);
      throw new ExternalServiceError('Serper', error);
    }
  }

  async validateInstagramProfile(username: string): Promise<{
    exists: boolean;
    isPublic: boolean;
    followers?: number;
    posts?: number;
    verified?: boolean;
  }> {
    try {
      const searchQuery = `site:instagram.com/${username} -inurl:tagged -inurl:reels`;
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          num: 5,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const results = response.data.organic || [];
      
      if (results.length === 0) {
        return { exists: false, isPublic: false };
      }

      // Check if we can find the main profile page
      const profileResult = results.find(r => 
        r.link.includes(`instagram.com/${username}`) && 
        !r.link.includes('/p/') && 
        !r.link.includes('/reel/')
      );

      if (!profileResult) {
        return { exists: false, isPublic: false };
      }

      // Extract basic info from snippet
      const profileInfo = this.extractProfileInfo(profileResult.snippet);
      
      return {
        exists: true,
        isPublic: true,
        ...profileInfo,
      };
    } catch (error: any) {
      this.logger.error('Instagram profile validation failed:', error);
      return { exists: false, isPublic: false };
    }
  }

  private parseInstagramResults(results: SerperSearchResult[]): any[] {
    return results
      .filter(result => result.link.includes('instagram.com/'))
      .map(result => {
        const username = this.extractUsername(result.link);
        const profileType = this.determineProfileType(result.link);
        
        return {
          username,
          profileUrl: result.link,
          title: result.title,
          snippet: result.snippet,
          type: profileType,
          confidence: this.calculateProfileConfidence(result),
          source: 'serper',
        };
      })
      .filter(profile => profile.username && profile.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private parseContentResults(results: SerperSearchResult[]): any[] {
    return results
      .filter(result => result.link.includes('/p/') || result.link.includes('/reel/'))
      .map(result => {
        const postId = this.extractPostId(result.link);
        const isReel = result.link.includes('/reel/');
        
        return {
          postId,
          url: result.link,
          title: result.title,
          snippet: result.snippet,
          type: isReel ? 'reel' : 'post',
          engagement: this.extractEngagementHints(result.snippet),
          confidence: this.calculateContentConfidence(result),
        };
      })
      .filter(content => content.postId)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private extractUsername(url: string): string | null {
    const match = url.match(/instagram\.com\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  private extractPostId(url: string): string | null {
    const match = url.match(/\/(?:p|reel)\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  private determineProfileType(url: string): string {
    if (url.includes('/p/')) return 'post';
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/tagged/')) return 'tagged';
    return 'profile';
  }

  private calculateProfileConfidence(result: SerperSearchResult): number {
    let confidence = 0.5;
    
    // Higher confidence for main profile pages
    if (!result.link.includes('/p/') && !result.link.includes('/reel/')) {
      confidence += 0.3;
    }
    
    // Check for business indicators
    const businessIndicators = ['official', 'verified', 'business', 'company'];
    if (businessIndicators.some(indicator => 
      result.title.toLowerCase().includes(indicator) || 
      result.snippet.toLowerCase().includes(indicator)
    )) {
      confidence += 0.2;
    }
    
    // Position-based confidence
    confidence -= (result.position - 1) * 0.05;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private calculateContentConfidence(result: SerperSearchResult): number {
    let confidence = 0.5;
    
    // Higher confidence for reels
    if (result.link.includes('/reel/')) {
      confidence += 0.2;
    }
    
    // Check for engagement indicators
    const engagementWords = ['likes', 'views', 'popular', 'trending', 'viral'];
    if (engagementWords.some(word => result.snippet.toLowerCase().includes(word))) {
      confidence += 0.2;
    }
    
    // Position-based confidence
    confidence -= (result.position - 1) * 0.03;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private extractProfileInfo(snippet: string): any {
    const info: any = {};
    
    // Try to extract follower count
    const followerMatch = snippet.match(/(\d+(?:,\d+)*(?:\.\d+)?[KM]?)\s*followers/i);
    if (followerMatch) {
      info.followers = this.parseNumber(followerMatch[1]);
    }
    
    // Try to extract post count
    const postMatch = snippet.match(/(\d+(?:,\d+)*)\s*posts/i);
    if (postMatch) {
      info.posts = this.parseNumber(postMatch[1]);
    }
    
    // Check for verification
    if (snippet.toLowerCase().includes('verified') || snippet.includes('✓')) {
      info.verified = true;
    }
    
    return info;
  }

  private extractEngagementHints(snippet: string): any {
    const engagement: any = {};
    
    // Look for engagement metrics in snippet
    const likeMatch = snippet.match(/(\d+(?:,\d+)*(?:\.\d+)?[KM]?)\s*likes/i);
    if (likeMatch) {
      engagement.likes = this.parseNumber(likeMatch[1]);
    }
    
    const viewMatch = snippet.match(/(\d+(?:,\d+)*(?:\.\d+)?[KM]?)\s*views/i);
    if (viewMatch) {
      engagement.views = this.parseNumber(viewMatch[1]);
    }
    
    return engagement;
  }

  private parseNumber(str: string): number {
    const cleaned = str.replace(/,/g, '');
    
    if (cleaned.includes('K')) {
      return parseFloat(cleaned.replace('K', '')) * 1000;
    }
    
    if (cleaned.includes('M')) {
      return parseFloat(cleaned.replace('M', '')) * 1000000;
    }
    
    return parseInt(cleaned) || 0;
  }
}