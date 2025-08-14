# Instagram Detection Service

The Instagram Detection Service identifies Instagram profiles for businesses, analyzes their top-performing reels, and queues the best content for download. This service bridges business discovery and video scraping.

## 📋 Overview

**Port**: 3003  
**Technology**: Node.js, Express.js, TypeScript, Python  
**Dependencies**: MongoDB, Redis, Bull Queue, Serper.dev API, Instaloader  

## 🎯 Responsibilities

- **Profile Discovery**: Find Instagram profiles for businesses using Serper.dev
- **Profile Validation**: Verify profiles exist and are accessible
- **Reel Analysis**: Extract metadata from Instagram reels using Instaloader
- **Performance Ranking**: Identify top N reels based on engagement metrics
- **Queue Management**: Schedule video scraping for top-performing content
- **Rate Limiting**: Comply with Instagram and API rate limits

## 🏗 Architecture

```
[Business Data] → [Serper Search] → [Profile Validation] → [Reel Analysis]
       ↓               ↓                    ↓                    ↓
[Queue Trigger]    [Instagram API]    [Python/Instaloader]  [Reel Ranking]
       ↓               ↓                    ↓                    ↓
[Detection Job]    [Profile Creation]   [Metadata Extract]   [Top N Selection]
       ↓               ↓                    ↓                    ↓
[Redis Queue]       [MongoDB]           [Performance Calc]   [Video Queue]
```

## 🗄️ Data Models

**Social Profile Schema**:
```javascript
{
  _id: ObjectId,
  businessId: String,           // Associated business
  platform: String,            // 'instagram'
  username: String,             // Instagram username
  profileUrl: String,           // Full Instagram URL
  verified: Boolean,            // Verification status
  followers: Number,            // Follower count
  following: Number,            // Following count
  posts: Number,                // Total posts
  detectionStatus: String,      // 'pending' | 'processing' | 'completed' | 'failed'
  lastDetectionAt: Date,        // Last analysis timestamp
  topReels: [{                  // Top performing reels
    postId: String,             // Instagram post ID
    url: String,                // Full Instagram URL
    likes: Number,              // Like count
    comments: Number,           // Comment count
    views: Number,              // View count (if available)
    engagementRate: Number,     // Calculated engagement rate
    publishedAt: Date,          // Publication date
    thumbnail: String,          // Thumbnail URL
    duration: Number,           // Video duration in seconds
    rank: Number                // Performance rank (1-N)
  }],
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Compound indexes for efficient queries
{ businessId: 1, platform: 1 }
{ username: 1, platform: 1 }
{ detectionStatus: 1 }
{ 'topReels.engagementRate': -1 }
{ lastDetectionAt: -1 }
```

## 🔍 Reel Analysis Algorithm

### 1. Performance Scoring
```typescript
performanceScore = (
  engagementRate * 0.5 +      // 50% engagement weight
  recencyScore * 0.3 +        // 30% recency weight  
  contentScore * 0.2          // 20% content factors
)
```

### 2. Engagement Rate Calculation
```typescript
engagementRate = (likes + comments) / views
```

### 3. Recency Scoring
- **Past week**: 1.0 (full score)
- **Past month**: 0.8 (high score)
- **Past 3 months**: 0.5 (medium score)
- **Past 6 months**: 0.3 (low score)
- **Older**: 0.1 (minimal score)

### 4. Content Scoring Factors
- **Reel vs Regular Video**: Reels get +0.2 bonus
- **Duration Sweet Spot**: 15-30 seconds get +0.2, 7-60 seconds get +0.1
- **Engagement Prompts**: Keywords like "comment", "like", "share" get +0.1
- **Trending Content**: Keywords like "viral", "trending", "challenge" get +0.1

## 🔌 API Endpoints

### Profile Management

#### Create Instagram Profile
```http
POST /instagram/profiles
```

**Request**:
```json
{
  "businessId": "business123",
  "username": "restaurant_account", 
  "profileUrl": "https://instagram.com/restaurant_account"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "profile123",
    "businessId": "business123",
    "platform": "instagram",
    "username": "restaurant_account",
    "detectionStatus": "pending"
  }
}
```

#### Get Business Profiles
```http
GET /instagram/profiles/business/:businessId?page=1&limit=20&status=completed
```

#### Get Profile with Top Reels
```http
GET /instagram/profiles/:profileId
```

#### Get Top Reels Only
```http
GET /instagram/profiles/:profileId/reels?top=10
```

**Response**:
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "username": "restaurant_account",
    "totalReels": 15,
    "reels": [
      {
        "postId": "ABC123",
        "url": "https://instagram.com/p/ABC123/",
        "likes": 1500,
        "comments": 85,
        "views": 12000,
        "engagementRate": 0.132,
        "rank": 1,
        "publishedAt": "2024-01-15T10:30:00Z",
        "thumbnail": "https://instagram.com/...",
        "duration": 25.5
      }
    ]
  }
}
```

### Detection Operations

#### Start Detection Process
```http
POST /detection/start
```

**Request**:
```json
{
  "businessId": "business123",
  "businessName": "Downtown Restaurant",
  "location": "New York, NY",
  "keywords": ["restaurant", "food", "dining"]
}
```

#### Manual Profile Search
```http
POST /detection/search
```

#### Validate Instagram Profile
```http
POST /detection/validate
```

**Request**:
```json
{
  "username": "restaurant_account"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "username": "restaurant_account",
    "exists": true,
    "isPublic": true,
    "followers": 15420,
    "posts": 324,
    "verified": false
  }
}
```

#### Trigger Reel Analysis
```http
POST /instagram/profiles/:profileId/analyze
```

### Analytics & Monitoring

#### Get Profile Analytics
```http
GET /instagram/profiles/:profileId/analytics
```

**Response**:
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "username": "restaurant_account",
    "analytics": {
      "totalReels": 15,
      "averageEngagement": 0.087,
      "topPerformer": {
        "postId": "ABC123",
        "engagementRate": 0.132,
        "likes": 1500
      },
      "engagementTrend": "up",
      "contentTypes": {
        "short": 8,    // ≤15 seconds
        "medium": 5,   // 15-30 seconds
        "long": 2      // 30-60 seconds
      }
    }
  }
}
```

## 🐍 Python Integration (Instaloader)

**Extract Reels Script** (`src/python/extract_reels.py`):
```python
#!/usr/bin/env python3
import instaloader
import json
import sys

class ReelExtractor:
    def extract_reel_metadata(self, username, max_reels=50):
        loader = instaloader.Instaloader(
            download_videos=False,
            download_video_thumbnails=False,
            download_comments=False,
            save_metadata=False,
        )
        
        profile = instaloader.Profile.from_username(loader.context, username)
        
        for post in profile.get_posts():
            if post.is_video and post.video_duration <= 90:
                metadata = {
                    'shortcode': post.shortcode,
                    'likes': post.likes,
                    'comments': post.comments,
                    'video_duration': post.video_duration,
                    'video_view_count': post.video_view_count,
                    'date_utc': post.date_utc.isoformat(),
                    'caption': post.caption[:500],
                    'is_reel': True
                }
                print(json.dumps(metadata))
```

**Node.js Integration**:
```typescript
const process = spawn('python', [pythonScript, username]);
process.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => {
    if (line.startsWith('{')) {
      const reelData = JSON.parse(line);
      reels.push(this.formatReelMetadata(reelData));
    }
  });
});
```

## ⚡ Background Jobs

**Job Types**:

### Instagram Profile Detection
```typescript
detectionQueue.process('detect-instagram-profiles', async (job) => {
  const { businessId, businessName, location, keywords } = job.data;
  
  // 1. Search Instagram profiles with Serper.dev
  // 2. Validate profiles exist and are public
  // 3. Create social profile records
  // 4. Queue reel analysis for each profile
  // 5. Update detection status
});
```

### Reel Analysis  
```typescript
detectionQueue.process('analyze-instagram-reels', async (job) => {
  const { profileId, username } = job.data;
  
  // 1. Check rate limiting
  // 2. Extract reel metadata with Python/Instaloader
  // 3. Calculate engagement and performance scores
  // 4. Rank and select top N reels
  // 5. Update social profile with results
  // 6. Queue video scraping for top reels
});
```

## 🚦 Rate Limiting & Compliance

**Instagram Rate Limits**:
- **Profile Analysis**: 5 requests per hour per username
- **Profile Search**: 10 requests per hour per user
- **Profile Validation**: 20 requests per hour per user
- **Content Search**: 15 requests per hour per user

**Implementation**:
```typescript
// Redis-based rate limiting
async checkRateLimit(identifier: string, limit: number, window: number): Promise<boolean> {
  const key = `ratelimit:instagram:${identifier}`;
  const current = await this.redis.incr(key);
  
  if (current === 1) {
    await this.redis.expire(key, window);
  }
  
  return current <= limit;
}
```

**Anti-Detection Measures**:
- Random delays between requests (0.5-1.5 seconds)
- Session persistence to reduce login frequency
- Distributed rate limiting across users
- Respectful request patterns

## 🏥 Health Monitoring

**Health Check** (`GET /health`):
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "queue": true,
    "redis": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Service Dependencies**:
- **MongoDB**: Social profile and reel storage
- **Redis**: Rate limiting, job queues, caching
- **Serper.dev API**: Instagram profile discovery
- **Python/Instaloader**: Reel metadata extraction
- **Bull Queue**: Background job processing

## ⚙️ Configuration

**Environment Variables**:
```bash
# Server
PORT=3003
NODE_ENV=development

# Database & Cache
MONGODB_URI=mongodb://localhost:27017/anatome-ai
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# External APIs
SERPER_API_KEY=your_serper_api_key

# Instagram Settings
INSTAGRAM_SESSION_FILE=./sessions/instagram_session.json
TOP_REELS_COUNT=10

# Rate Limiting
DETECTION_RATE_LIMIT=5
SEARCH_RATE_LIMIT=10
VALIDATION_RATE_LIMIT=20

# Python Integration
PYTHON_SCRIPT_TIMEOUT=120000
```

## 🚀 Development

**Setup**:
```bash
cd services/instagram-detection
npm install
pip3 install instaloader  # Python dependency
npm run dev
```

**Docker**:
```bash
docker build -t anatome-instagram-detection .
docker run -p 3003:3003 anatome-instagram-detection
```

## 🧪 Testing

**Unit Tests**:
```bash
npm test
```

**Test Categories**:
- Profile detection logic
- Reel analysis algorithms
- Rate limiting compliance
- Queue job processing
- Serper API integration

## 📊 Performance Metrics

**Benchmarks**:
- Profile detection: 30-60 seconds per business
- Reel analysis: 45-90 seconds per profile
- Top reel identification: <5 seconds
- Queue throughput: 10 jobs/minute
- Success rate: 90%+ for public profiles

**Optimizations**:
- Cached profile validation results (1 hour TTL)
- Cached reel analysis results (2 hour TTL)
- Parallel profile processing
- Efficient database indexing
- Connection pooling

## 🔍 Logging

**Log Categories**:
- **Detection Jobs**: Profile discovery and analysis
- **API Requests**: Rate limiting and validation
- **Python Integration**: Instaloader execution
- **Queue Processing**: Job lifecycle and errors
- **Performance**: Response times and throughput

**Log Format**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "service": "instagram-detection",
  "operation": "reel_analysis",
  "username": "restaurant_account",
  "profileId": "profile123",
  "reelsFound": 15,
  "topReels": 10,
  "processingTime": 67.5
}
```

## 🚨 Error Handling

**Common Errors**:

| Code | Status | Description |
|------|--------|-------------|
| `PROFILE_NOT_FOUND` | 404 | Instagram profile doesn't exist |
| `PRIVATE_PROFILE` | 403 | Profile is private/restricted |
| `ANALYSIS_IN_PROGRESS` | 409 | Analysis already running |
| `RATE_LIMIT_EXCEEDED` | 429 | API rate limits exceeded |
| `INSTALOADER_ERROR` | 503 | Python script execution failed |

**Error Recovery**:
- Retry failed jobs with exponential backoff
- Graceful degradation for Instagram API issues
- Fallback to cached results when available
- Detailed error logging for debugging

## 🔒 Security

**Data Protection**:
- Instagram session encryption
- Rate limiting per user/IP
- Input validation and sanitization
- Secure credential storage

**Privacy Compliance**:
- Only public profile analysis
- Respect Instagram Terms of Service
- No personal data storage beyond metrics
- User consent verification

## 📚 API Documentation

**Swagger**: Available through API Gateway at `/api/docs`

## 🤝 Contributing

1. Follow Instagram ToS compliance
2. Add comprehensive rate limiting
3. Include Python script error handling
4. Update reel analysis algorithms
5. Add appropriate monitoring and logging

## 🔗 Related Services

- [API Gateway](./api-gateway.md) - Request routing and authentication
- [Business Discovery](./business-discovery.md) - Triggers Instagram detection
- [Video Scraping](./video-scraping.md) - Downloads identified top reels
- [Video Analysis](./video-analysis.md) - Analyzes scraped content

---

**Next**: [Video Analysis Service](./video-analysis.md)