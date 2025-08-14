# System Architecture Overview

Anatome.ai is built as a comprehensive microservices-based platform designed for competitive intelligence and social media content analysis. The architecture prioritizes scalability, maintainability, and performance.

## 🏗 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  React Native Mobile App  │  Expo Web Client  │  API Clients   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                              │
├─────────────────────────────────────────────────────────────────┤
│  • Authentication & Authorization  • Rate Limiting             │
│  • Request Routing                • Health Monitoring          │
│  • CORS & Security               • Load Balancing             │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Microservices Layer                       │
├─────────────┬─────────────┬─────────────┬─────────────┬────────┤
│ User Mgmt   │ Business    │ Instagram   │ Video       │ Video  │
│ Service     │ Discovery   │ Detection   │ Scraping    │ Analysis│
│             │ Service     │ Service     │ Service     │ Service │
├─────────────┼─────────────┼─────────────┼─────────────┼────────┤
│ Report      │ Analytics   │ File        │ Job Queue   │        │
│ Generation  │ Service     │ Storage     │ Service     │        │
│ Service     │             │ Service     │             │        │
└─────────────┴─────────────┴─────────────┴─────────────┴────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data & Storage Layer                       │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│    MongoDB      │      Redis      │   Backblaze B2  │ External │
│  Primary DB     │  Cache & Queue  │  File Storage   │   APIs   │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## 🎯 Design Principles

### 1. Microservices Architecture
- **Single Responsibility**: Each service has a focused domain
- **Loose Coupling**: Services communicate via well-defined APIs
- **High Cohesion**: Related functionality grouped together
- **Independent Deployment**: Services can be deployed independently

### 2. API-First Design
- **RESTful APIs**: Consistent HTTP-based interfaces
- **OpenAPI Specification**: Comprehensive API documentation
- **Versioning**: Support for API evolution
- **Standard Response Format**: Consistent error and success responses

### 3. Event-Driven Architecture
- **Asynchronous Processing**: Background jobs for heavy operations
- **Queue-Based Communication**: Redis Bull queues for job processing
- **Event Sourcing**: Audit trails and state reconstruction
- **Reactive Systems**: Responsive to load and failures

### 4. Security-First
- **JWT Authentication**: Stateless token-based security
- **Role-Based Access Control**: Granular permissions
- **Input Validation**: Comprehensive data validation
- **Rate Limiting**: Protection against abuse

## 🔧 Core Services

### API Gateway (Port 3000)
**Role**: Single entry point and traffic director
- Request routing to appropriate services
- JWT token validation and user context forwarding
- Rate limiting and CORS handling
- Health check aggregation
- Request/response logging

### User Management (Port 3001)
**Role**: Authentication and user lifecycle
- User registration and login
- JWT token generation and refresh
- Session management with Redis
- Password security and account operations
- Subscription and role management

### Business Discovery (Port 3002)
**Role**: Competitor intelligence gathering
- Business profile management
- Geospatial competitor discovery
- Serper.dev API integration
- Market analysis and insights
- Background job queuing

### Video Scraping (Port 8001)
**Role**: Instagram content extraction
- Instagram profile and video scraping
- Instaloader integration with rate limiting
- File upload to Backblaze B2/S3
- Usage quota management
- Anti-detection measures

### Video Analysis (Port 3004)
**Role**: AI-powered content analysis
- Video frame extraction and analysis
- Gemini Vision API integration
- Performance metric calculation
- Content categorization
- Trend identification

### Report Generation (Port 3005)
**Role**: Comprehensive report creation
- Data aggregation across services
- OpenRouter GPT-5-nano integration
- PDF generation and export
- Insight synthesis
- Actionable recommendations

## 💾 Data Architecture

### Primary Database (MongoDB)
**Purpose**: Persistent data storage
- **Users**: Authentication and profiles
- **Businesses**: Company and competitor data
- **Social Profiles**: Instagram account information  
- **Videos**: Scraped content metadata
- **Analytics**: Performance metrics and insights
- **Reports**: Generated intelligence reports

**Features**:
- Document-based flexible schema
- Geospatial indexing for location queries
- Replica sets for high availability
- Automatic failover and recovery

### Cache & Queue Layer (Redis)
**Purpose**: Performance and async processing
- **Session Storage**: JWT session management
- **Job Queues**: Background task processing
- **Rate Limiting**: Distributed rate limiting
- **API Caching**: Response caching
- **Token Blacklisting**: Security enforcement

### File Storage (Backblaze B2)
**Purpose**: Media file management
- **Video Storage**: Scraped Instagram videos
- **Thumbnail Storage**: Video preview images
- **Report Storage**: Generated PDF reports
- **CDN Integration**: Fast global delivery
- **Cost Optimization**: Cheaper than AWS S3

## 🌐 External Integrations

### Serper.dev API
- Business and competitor discovery
- Local business intelligence
- Market research data
- Location-based search

### Instagram (via Instaloader)
- Profile content scraping
- Video and metadata extraction
- Rate-limited API compliance
- Session management

### OpenRouter (GPT-5-nano)
- Advanced text generation
- Report synthesis
- Insight generation
- Content analysis

### Google Gemini Vision API
- Video frame analysis
- Visual content understanding
- Object and scene detection
- Performance prediction

## 🔄 Data Flow Patterns

### 1. User Registration Flow
```
Client → API Gateway → User Management → MongoDB
                            ↓
                       Redis (Session)
```

### 2. Competitor Discovery Flow
```
Client → API Gateway → Business Discovery → Serper.dev API
                            ↓                      ↓
                       MongoDB (Business)     Bull Queue
                            ↓                      ↓
                    Instagram Detection     Redis (Jobs)
```

### 3. Video Analysis Pipeline
```
Video Scraping → File Storage → Video Analysis → Report Generation
       ↓              ↓              ↓                ↓
   Instagram     Backblaze B2    Gemini API      OpenRouter
       ↓              ↓              ↓                ↓
   MongoDB        File URLs      MongoDB          PDF Export
```

## 📊 Scalability Considerations

### Horizontal Scaling
- **Service Replication**: Multiple instances per service
- **Load Balancing**: Request distribution
- **Database Sharding**: Data partitioning
- **Queue Workers**: Parallel job processing

### Performance Optimization
- **Connection Pooling**: Efficient database connections
- **Response Caching**: Redis-based caching
- **CDN Integration**: Global content delivery
- **Async Processing**: Non-blocking operations

### Resource Management
- **Container Orchestration**: Docker-based deployment
- **Auto-scaling**: Dynamic resource allocation
- **Health Monitoring**: Automated failure detection
- **Circuit Breakers**: Graceful degradation

## 🛡️ Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Token Rotation**: Enhanced security
- **Role-Based Access**: Granular permissions
- **Session Management**: Redis-based sessions

### API Security
- **Rate Limiting**: Abuse prevention
- **Input Validation**: Data sanitization
- **CORS Configuration**: Cross-origin security
- **HTTPS Enforcement**: Transport encryption

### Data Protection
- **Encryption at Rest**: Database encryption
- **Secure File Storage**: Encrypted file uploads
- **Credential Management**: Environment-based secrets
- **Audit Logging**: Security event tracking

## 🔍 Monitoring & Observability

### Health Monitoring
- **Service Health Checks**: Real-time status monitoring
- **Dependency Tracking**: External service health
- **Performance Metrics**: Response time and throughput
- **Error Rate Tracking**: Failure pattern analysis

### Logging Strategy
- **Structured Logging**: JSON-formatted logs
- **Centralized Aggregation**: Log collection
- **Correlation IDs**: Request tracing
- **Performance Metrics**: Response time tracking

### Alerting & Notifications
- **Threshold Monitoring**: Automated alerts
- **Service Degradation**: Performance notifications
- **Error Rate Spikes**: Immediate notifications
- **Resource Utilization**: Capacity planning

## 🚀 Development & Deployment

### Development Environment
- **Docker Compose**: Local development stack
- **Hot Reloading**: Fast development iteration
- **Environment Isolation**: Consistent dev environment
- **Database Seeding**: Test data management

### Production Deployment
- **Container Orchestration**: Kubernetes/Docker Swarm
- **Blue-Green Deployment**: Zero-downtime deployments
- **Auto-scaling**: Dynamic resource management
- **Health Checks**: Service availability monitoring

### CI/CD Pipeline
- **Automated Testing**: Unit and integration tests
- **Code Quality**: Linting and formatting
- **Security Scanning**: Vulnerability assessment
- **Deployment Automation**: Streamlined releases

## 📈 Future Architecture Evolution

### Planned Enhancements
- **GraphQL Federation**: Unified API layer
- **Event Streaming**: Apache Kafka integration
- **Machine Learning**: Enhanced AI capabilities
- **Multi-tenancy**: Enterprise features

### Scalability Roadmap
- **Database Optimization**: Advanced indexing
- **Caching Strategy**: Multi-level caching
- **API Gateway Enhancement**: Advanced routing
- **Monitoring Expansion**: Comprehensive observability

---

**Next**: [Microservices Architecture](./microservices.md)