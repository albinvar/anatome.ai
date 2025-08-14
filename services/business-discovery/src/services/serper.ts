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

interface SerperPlace {
  title: string;
  address: string;
  phoneNumber?: string;
  website?: string;
  category: string;
  rating?: number;
  reviews?: number;
  hours?: any;
  latitude: number;
  longitude: number;
  placeId: string;
  cid?: string;
  socialMediaLinks?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
}

interface SerperPlacesResponse {
  places: SerperPlace[];
  searchParameters: {
    q: string;
    location: string;
    type?: string;
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

  async searchBusinesses(params: {
    query: string;
    location: string;
    type?: string;
    radius?: number;
  }): Promise<any[]> {
    try {
      // First try Places API for more structured data
      const places = await this.searchPlaces(params);
      
      if (places.length > 0) {
        this.logger.info(`Found ${places.length} businesses using Places API`);
        return places;
      }
      
      // Fallback to regular search API
      this.logger.info('No places found, falling back to regular search');
      const searchQuery = this.buildSearchQuery(params);
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          location: params.location,
          num: 20,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      return this.parseBusinessResults(response.data.organic || []);
    } catch (error: any) {
      this.logger.error('Serper search failed:', error);
      throw new ExternalServiceError('Serper', error);
    }
  }

  async searchCompetitors(business: {
    name: string;
    type: string;
    location: {
      city: string;
      state: string;
    };
    industry: string;
  }, radius: number = 50): Promise<any[]> {
    try {
      const excludeQuery = `-"${business.name}"`;
      const typeQuery = business.type || business.industry;
      const locationQuery = `${business.location.city}, ${business.location.state}`;
      
      // First try Places API for competitors
      const places = await this.searchPlaces({
        query: typeQuery,
        location: locationQuery,
        type: business.industry,
        radius
      });
      
      if (places.length > 0) {
        // Filter out the original business
        const competitors = places.filter(place => 
          !place.name.toLowerCase().includes(business.name.toLowerCase())
        );
        
        this.logger.info(`Found ${competitors.length} competitors using Places API`);
        return competitors;
      }
      
      // Fallback to regular search
      const searchQuery = `${typeQuery} businesses near ${locationQuery} ${excludeQuery}`;

      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          location: locationQuery,
          num: 30,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const competitors = this.parseBusinessResults(response.data.organic || []);
      
      // Filter by estimated distance (this is approximate)
      return competitors.filter(competitor => {
        // In a real implementation, you'd calculate actual distance
        // For now, return all results as Serper already filters by location
        return true;
      });
    } catch (error: any) {
      this.logger.error('Competitor search failed:', error);
      throw new ExternalServiceError('Serper', error);
    }
  }

  async getBusinessDetails(businessName: string, location: string): Promise<any> {
    try {
      const searchQuery = `"${businessName}" ${location} contact information website`;
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          location: location,
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
        return null;
      }

      // Extract business details from search results
      return this.extractBusinessDetails(results);
    } catch (error: any) {
      this.logger.error('Business details search failed:', error);
      throw new ExternalServiceError('Serper', error);
    }
  }

  private buildSearchQuery(params: {
    query: string;
    location: string;
    type?: string;
    radius?: number;
  }): string {
    let query = params.query;
    
    if (params.type) {
      query += ` ${params.type}`;
    }
    
    query += ` near ${params.location}`;
    
    if (params.radius) {
      query += ` within ${params.radius}km`;
    }
    
    return query;
  }

  private parseBusinessResults(results: SerperSearchResult[]): any[] {
    return results.map(result => {
      const name = this.extractBusinessName(result.title);
      const website = this.extractWebsite(result.link);
      const address = this.extractAddress(result.snippet);
      
      return {
        name,
        website,
        address,
        snippet: result.snippet,
        source: 'serper',
        confidence: this.calculateConfidence(result),
      };
    }).filter(business => business.name && business.confidence > 0.5);
  }

  private extractBusinessName(title: string): string {
    // Remove common suffixes and clean up
    return title
      .replace(/\s*[-|]\s*.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractWebsite(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return url;
    }
  }

  private extractAddress(snippet: string): string | null {
    // Simple address extraction - could be improved with regex
    const addressPatterns = [
      /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)/i,
      /\d+\s+[\w\s]+,\s+[\w\s]+,\s+[A-Z]{2}\s+\d{5}/,
    ];
    
    for (const pattern of addressPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    return null;
  }

  private calculateConfidence(result: SerperSearchResult): number {
    let confidence = 1.0;
    
    // Lower confidence for results further down
    confidence -= (result.position - 1) * 0.05;
    
    // Check for business indicators
    const businessIndicators = ['LLC', 'Inc', 'Corp', 'Company', 'Business', 'Services'];
    const hasIndicator = businessIndicators.some(indicator => 
      result.title.includes(indicator) || result.snippet.includes(indicator)
    );
    
    if (!hasIndicator) {
      confidence -= 0.2;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  private extractBusinessDetails(results: SerperSearchResult[]): any {
    const details: any = {
      name: null,
      website: null,
      phone: null,
      address: null,
      description: null,
    };
    
    for (const result of results) {
      if (!details.name) {
        details.name = this.extractBusinessName(result.title);
      }
      
      if (!details.website) {
        details.website = this.extractWebsite(result.link);
      }
      
      if (!details.phone) {
        const phoneMatch = result.snippet.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch) {
          details.phone = phoneMatch[0];
        }
      }
      
      if (!details.address) {
        details.address = this.extractAddress(result.snippet);
      }
      
      if (!details.description && result.snippet.length > 50) {
        details.description = result.snippet;
      }
    }
    
    return details;
  }

  async searchPlaces(params: {
    query: string;
    location: string;
    type?: string;
    radius?: number;
  }): Promise<any[]> {
    try {
      const searchQuery = params.type ? `${params.query} ${params.type}` : params.query;
      
      const response = await axios.post<SerperPlacesResponse>(
        `${this.baseUrl}/places`,
        {
          q: searchQuery,
          location: params.location,
          hl: 'en',
          gl: 'us',
          radius: params.radius ? params.radius * 1000 : 50000, // Convert km to meters
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const places = response.data.places || [];
      return await this.enrichPlacesWithSocialMedia(places);
    } catch (error: any) {
      this.logger.warn('Places API search failed, will use fallback:', error.message);
      return [];
    }
  }

  private async enrichPlacesWithSocialMedia(places: SerperPlace[]): Promise<any[]> {
    const enrichedPlaces = [];
    
    for (const place of places) {
      let socialMedia = place.socialMediaLinks || {};
      
      // If Instagram not found in place data, search for it
      if (!socialMedia.instagram) {
        try {
          const instagramUrl = await this.searchInstagramForBusiness(place.title);
          if (instagramUrl) {
            socialMedia.instagram = instagramUrl;
          }
        } catch (error) {
          this.logger.debug(`Failed to find Instagram for ${place.title}:`, error.message);
        }
      }
      
      const enrichedPlace = {
        name: place.title,
        address: place.address,
        phone: place.phoneNumber,
        website: place.website,
        category: place.category,
        rating: place.rating,
        reviews: place.reviews,
        location: {
          latitude: place.latitude,
          longitude: place.longitude,
        },
        placeId: place.placeId,
        socialMedia,
        source: 'serper-places',
        confidence: 0.9, // Places API generally has high confidence
      };
      
      enrichedPlaces.push(enrichedPlace);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return enrichedPlaces;
  }

  async searchInstagramForBusiness(businessName: string): Promise<string | null> {
    try {
      const searchQuery = `"${businessName}" instagram`;
      
      const response = await axios.post<SerperResponse>(
        `${this.baseUrl}/search`,
        {
          q: searchQuery,
          num: 10,
        },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const results = response.data.organic || [];
      
      // Look for Instagram URLs in the results
      for (const result of results) {
        // Check if the link is an Instagram profile
        if (result.link.includes('instagram.com/') && !result.link.includes('/p/')) {
          const instagramMatch = result.link.match(/instagram\.com\/(\w+)/);
          if (instagramMatch && instagramMatch[1] !== 'p') {
            this.logger.info(`Found Instagram for ${businessName}: ${result.link}`);
            return result.link;
          }
        }
        
        // Also check snippet for Instagram mentions
        const snippetMatch = result.snippet.match(/instagram\.com\/(\w+)/i);
        if (snippetMatch && snippetMatch[1] !== 'p') {
          const instagramUrl = `https://instagram.com/${snippetMatch[1]}`;
          this.logger.info(`Found Instagram in snippet for ${businessName}: ${instagramUrl}`);
          return instagramUrl;
        }
      }
      
      return null;
    } catch (error: any) {
      this.logger.error(`Instagram search failed for ${businessName}:`, error);
      return null;
    }
  }
}