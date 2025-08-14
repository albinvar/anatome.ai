# Business Discovery Service

The Business Discovery Service handles competitor discovery, business data management, and market analysis using the Serper.dev API for intelligent business intelligence gathering.

## 📋 Overview

**Port**: 3002  
**Technology**: Node.js, Express.js, TypeScript  
**Dependencies**: MongoDB, Redis, Bull Queue, Serper.dev API  

## 🎯 Responsibilities

- **Business Management**: CRUD operations for business entities
- **Competitor Discovery**: Automated competitor identification
- **Market Analysis**: Location-based market intelligence
- **Geospatial Search**: Radius-based business discovery
- **Data Enrichment**: Business profile enhancement
- **Background Processing**: Async discovery workflows

## 🏗 Architecture

```
[Business Data] → [Serper API] → [Competitor Discovery] → [Queue Processing]
       ↓               ↓                    ↓                    ↓
  [MongoDB]      [Rate Limiting]      [Bull Queue]         [Instagram Jobs]
       ↓               ↓                    ↓                    ↓
 [Geospatial]    [API Management]     [Redis Jobs]       [Profile Creation]
```

## 🗄️ Data Models

**Business Schema**:
```javascript
{
  _id: ObjectId,
  userId: String,              // Owner user ID
  name: String,                // Business name
  type: String,                // Business type/category
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {             // GeoJSON Point
      lat: Number,             // Latitude
      lng: Number              // Longitude
    }
  },
  industry: String,            // Industry classification
  website: String,             // Business website
  competitors: [ObjectId],     // Discovered competitors
  discoveryStatus: String,     // 'pending' | 'discovering' | 'completed' | 'failed'
  lastDiscoveryAt: Date,       // Last discovery run
  createdAt: Date,
  updatedAt: Date
}
```

**Geospatial Indexing**:
```javascript
// 2dsphere index for location-based queries
db.businesses.createIndex({ "location.coordinates": "2dsphere" });

// Compound indexes for efficient queries
db.businesses.createIndex({ userId: 1, createdAt: -1 });
db.businesses.createIndex({ industry: 1 });
db.businesses.createIndex({ "location.city": 1, "location.state": 1 });
```

## 🌍 Competitor Discovery

### Discovery Process
1. **Business Analysis**: Extract business characteristics
2. **Search Strategy**: Build targeted search queries
3. **Geospatial Filtering**: Apply radius-based filtering
4. **Result Processing**: Parse and validate competitors
5. **Data Enrichment**: Enhance competitor profiles
6. **Instagram Queuing**: Queue social media discovery

### API Integration (Serper.dev)

**Search Query Construction**:
```typescript
const searchQuery = `${businessType} businesses near ${city}, ${state} -"${excludeBusinessName}"`;

const response = await serperAPI.search({
  q: searchQuery,
  location: `${city}, ${state}`,
  num: 30
});
```

**Configuration**:
```bash
# Discovery limits
DEFAULT_DISCOVERY_RADIUS=50    # Default radius in km
MAX_DISCOVERY_RADIUS=100       # Maximum allowed radius

# Serper API
SERPER_API_KEY=your_serper_key
```

## 🔌 API Endpoints

### Business Management

#### Create Business
```http
POST /businesses
```

**Request**:
```json
{
  "name": "Downtown Restaurant",
  "type": "restaurant",
  "location": {
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "coordinates": {
      "lat": 40.7128,
      "lng": -74.0060
    }
  },
  "industry": "food-service",
  "website": "https://restaurant.com"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "business123",
    "name": "Downtown Restaurant",
    "discoveryStatus": "pending",
    "competitors": [],
    "createdAt": "2024-01-01T12:00:00Z"
  }
}
```

#### List Businesses
```http
GET /businesses?page=1&limit=20&industry=restaurant&city=New York
```

#### Get Business with Competitors
```http
GET /businesses/:id
```

#### Trigger Competitor Discovery
```http
POST /businesses/:id/rediscover
```

**Request**:
```json
{
  "radius": 75  // Max 100km
}
```

### Discovery Operations

#### Search Businesses
```http
POST /discovery/search
```

**Request**:
```json
{
  "name": "coffee shop",
  "location": "Seattle, WA",
  "type": "cafe",
  "radius": 25
}
```

#### Competitor Discovery
```http
POST /discovery/competitors
```

#### Market Analysis
```http
POST /discovery/market-analysis
```

**Request**:
```json
{
  "location": "Austin, TX",
  "industry": "restaurant",
  "businessType": "italian restaurant",
  "radius": 50
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalBusinesses": 45,
    "location": "Austin, TX",
    "industry": "restaurant",
    "competitionLevel": "high",
    "marketInsights": {
      "averageConfidence": 0.78,
      "hasEstablishedPlayers": true
    },
    "businesses": [...]
  }
}
```

## ⚡ Background Job Processing

**Bull Queue Configuration**:
```typescript
const discoveryQueue = new Bull('business-discovery', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  }
});
```

**Job Types**:

### Competitor Discovery Job
```typescript
discoveryQueue.process('discover-competitors', async (job) => {
  const { businessId, radius } = job.data;
  
  // 1. Get business details
  // 2. Search for competitors
  // 3. Create competitor records  
  // 4. Queue Instagram detection
  // 5. Update discovery status
});
```

### Business Enrichment Job
```typescript
discoveryQueue.process('enrich-business', async (job) => {
  const { businessId } = job.data;
  
  // 1. Get additional business details
  // 2. Update business profile
  // 3. Enhance location data
});
```

**Job Status Tracking**:
```http
GET /discovery/jobs/:jobId
```

**Queue Statistics** (Admin):
```http
GET /discovery/stats
```

## 🌐 Serper.dev Integration

**Service Class**:
```typescript
class SerperService {
  async searchBusinesses(params: {
    query: string;
    location: string;
    type?: string;
    radius?: number;
  }): Promise<BusinessResult[]>
  
  async searchCompetitors(business: Business, radius: number): Promise<CompetitorResult[]>
  
  async getBusinessDetails(name: string, location: string): Promise<BusinessDetails>
}
```

**Rate Limiting**:
- Respects Serper API limits
- Queue-based processing
- Retry mechanism with exponential backoff
- Error handling and fallbacks

**Result Processing**:
```typescript
private parseBusinessResults(results: SerperResult[]): BusinessResult[] {
  return results.map(result => ({
    name: this.extractBusinessName(result.title),
    website: this.extractWebsite(result.link),
    address: this.extractAddress(result.snippet),
    confidence: this.calculateConfidence(result)
  })).filter(business => business.confidence > 0.5);
}
```

## 📍 Geospatial Features

**Distance Calculation**:
```javascript
// MongoDB geospatial query
db.businesses.find({
  "location.coordinates": {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [longitude, latitude]
      },
      $maxDistance: radiusInMeters
    }
  }
});
```

**Radius Configuration**:
- **Default**: 50km radius
- **Maximum**: 100km radius
- **Configurable**: Per-request override
- **Validation**: Enforced limits

## 🏥 Health Monitoring

**Health Check** (`GET /health`):
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "queue": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Service Dependencies**:
- **MongoDB**: Business data storage
- **Redis**: Job queue and caching
- **Serper API**: External data source
- **Background Workers**: Job processing

## ⚙️ Configuration

**Environment Variables**:
```bash
# Server
PORT=3002
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/anatome-ai

# Redis/Queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# External APIs
SERPER_API_KEY=your_serper_api_key

# Discovery Configuration
DEFAULT_DISCOVERY_RADIUS=50
MAX_DISCOVERY_RADIUS=100
MAX_COMPETITORS_PER_DISCOVERY=30

# Job Processing
MAX_JOB_ATTEMPTS=3
JOB_RETRY_DELAY=5000
QUEUE_CONCURRENCY=5
```

## 🚀 Development

**Setup**:
```bash
cd services/business-discovery
npm install
npm run dev
```

**Database Setup**:
```javascript
// Create geospatial index
db.businesses.createIndex({ "location.coordinates": "2dsphere" });

// Create compound indexes
db.businesses.createIndex({ userId: 1, createdAt: -1 });
db.businesses.createIndex({ industry: 1 });
```

**Docker**:
```bash
docker build -t anatome-business-discovery .
docker run -p 3002:3002 anatome-business-discovery
```

## 🧪 Testing

**Unit Tests**:
```bash
npm test
```

**Test Categories**:
- Business CRUD operations
- Geospatial queries
- Serper API integration
- Job queue processing
- Discovery algorithms

**Integration Tests**:
```bash
npm run test:integration
```

## 📊 Analytics & Insights

**Discovery Metrics**:
- Average competitors found per search
- Discovery success rates
- Geographic distribution of businesses
- Industry coverage analysis

**Performance Metrics**:
- Discovery processing time
- API response times
- Queue throughput
- Error rates by operation

## 🔍 Logging

**Log Categories**:
- **Business Operations**: CRUD activities
- **Discovery Jobs**: Processing status
- **API Integration**: Serper.dev interactions
- **Queue Management**: Job lifecycle
- **Performance**: Response times and throughput

**Log Format**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "service": "business-discovery",
  "operation": "competitor_discovery",
  "businessId": "business123",
  "userId": "user123",
  "competitorsFound": 15,
  "processingTime": 45.2,
  "radius": 50
}
```

## 🚨 Error Handling

**Common Errors**:

| Code | Status | Description |
|------|--------|-------------|
| `BUSINESS_EXISTS` | 409 | Business already exists |
| `DISCOVERY_IN_PROGRESS` | 409 | Discovery already running |
| `INVALID_RADIUS` | 400 | Radius exceeds maximum |
| `SERPER_API_ERROR` | 503 | External API failure |
| `JOB_FAILED` | 500 | Background job error |

**Error Recovery**:
- Automatic retry for transient failures
- Fallback to cached data when possible
- Graceful degradation for external API issues
- Detailed error logging for debugging

## 📈 Performance Optimization

**Database Optimization**:
- Geospatial indexing for location queries
- Compound indexes for common query patterns
- Connection pooling for high throughput
- Query result caching

**API Optimization**:
- Rate limiting compliance
- Response compression
- Connection reuse
- Batch processing where possible

## 🔒 Security

**Data Protection**:
- User data isolation (userId filtering)
- Input validation and sanitization
- SQL injection prevention
- Secure API key management

**Access Control**:
- User-specific business access
- Admin-only statistics endpoints
- Rate limiting per user
- Audit logging for changes

## 📚 API Documentation

**Swagger**: Available through API Gateway at `/api/docs`

## 🤝 Contributing

1. Follow geospatial data standards
2. Add comprehensive error handling
3. Include background job processing
4. Update discovery algorithms
5. Add appropriate monitoring and logging

## 🔗 Related Services

- [API Gateway](./api-gateway.md) - Request routing and auth
- [Instagram Detection](./instagram-detection.md) - Social profile discovery
- [User Management](./user-management.md) - Business ownership
- [Job Queue](./job-queue.md) - Background processing

---

**Next**: [Instagram Detection Service](./instagram-detection.md)