# User Management Service

The User Management Service handles all user-related operations including authentication, authorization, session management, and user profiles with JWT token-based security.

## 📋 Overview

**Port**: 3001  
**Technology**: Node.js, Express.js, TypeScript  
**Dependencies**: MongoDB, Redis, JWT, bcryptjs  

## 🎯 Responsibilities

- **User Authentication**: Registration, login, token management
- **Session Management**: Redis-based session storage
- **JWT Token Handling**: Access and refresh token lifecycle
- **User Profiles**: Account management and preferences
- **Role-Based Access**: Admin and user role management
- **Security**: Password hashing, token blacklisting

## 🏗 Architecture

```
[Client] → [Auth Routes] → [JWT Validation] → [User Database]
              ↓                 ↓                   ↓
        [Session Storage]  [Token Blacklist]   [MongoDB]
              ↓                 ↓                   ↓
           [Redis]            [Redis]          [User Models]
```

## 🔐 Authentication Flow

### Registration
```http
POST /auth/register
```

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure123",
  "name": "John Doe"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "subscription": {
        "plan": "free",
        "expiresAt": "2024-02-01T00:00:00Z"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900
    }
  }
}
```

### Login
```http
POST /auth/login
```

### Token Refresh
```http
POST /auth/refresh
```

**Request**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Logout
```http
POST /auth/logout
POST /auth/logout-all  # All devices
```

## 🗄️ Data Models

**User Schema**:
```javascript
{
  _id: ObjectId,
  email: String,        // Unique, lowercase
  password: String,     // Bcrypt hashed
  name: String,
  role: String,         // 'admin' | 'user'
  subscription: {
    plan: String,       // 'free' | 'pro' | 'enterprise'
    expiresAt: Date
  },
  emailVerified: Boolean,
  refreshTokens: [String],  // Active refresh tokens
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary indexes
{ email: 1 }           // Unique login lookup
{ 'subscription.plan': 1 }  // Subscription queries
{ createdAt: -1 }      // Recent users
```

## 🎫 JWT Token System

**Access Tokens**:
- **Lifetime**: 15 minutes
- **Purpose**: API authorization
- **Storage**: Client memory/storage
- **Claims**: User ID, email, role

**Refresh Tokens**:
- **Lifetime**: 7 days
- **Purpose**: Access token renewal
- **Storage**: Database array + Redis blacklist
- **Rotation**: New token on each refresh

**Token Structure**:
```javascript
{
  "id": "user123",
  "email": "user@example.com", 
  "role": "user",
  "iat": 1640995200,
  "exp": 1640996100
}
```

## 🗃️ Session Management (Redis)

**Session Storage**:
```redis
session:user123:token_hash → {
  "userId": "user123",
  "createdAt": "2024-01-01T12:00:00Z"
}
```

**Token Blacklisting**:
```redis
blacklist:token_hash → "1"
```

**Operations**:
- **Create Session**: Store on login
- **Validate Session**: Check on each request
- **Invalidate**: Remove on logout
- **Cleanup**: Automatic expiration

## 👤 User Profile Management

### Get Profile
```http
GET /users/me
```

### Update Profile
```http
PUT /users/me
```

**Request**:
```json
{
  "name": "John Smith",
  "email": "john.smith@example.com"
}
```

### Change Password
```http
POST /users/me/change-password
```

**Request**:
```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

**Security**:
- Validates current password
- Invalidates all sessions
- Forces re-authentication

### Delete Account
```http
DELETE /users/me
```

**Process**:
1. Verify password
2. Blacklist all tokens
3. Delete all sessions
4. Remove user data

## 👑 Admin Operations

**Endpoints** (Admin only):
```http
GET /users              # List all users
GET /users/:id          # Get user by ID  
PUT /users/:id          # Update user
DELETE /users/:id       # Delete user
```

**Admin Capabilities**:
- User management
- Subscription changes
- Role assignments
- Account operations

## 🛡️ Security Features

**Password Security**:
```javascript
// Hashing (bcryptjs)
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);

// Validation
const isValid = await bcrypt.compare(password, hashedPassword);
```

**Token Security**:
- HMAC-SHA256 signing
- Secure random secrets
- Token rotation on refresh
- Blacklist for revoked tokens

**Session Security**:
- Redis storage encryption
- Session timeout
- Device-specific tokens
- Logout invalidation

## 📊 User Subscriptions

**Plans**:
```javascript
{
  free: {
    videoLimit: 50,
    features: ['basic-scraping']
  },
  pro: {
    videoLimit: 200,
    features: ['basic-scraping', 'priority-processing']
  },
  enterprise: {
    videoLimit: 1000,
    features: ['basic-scraping', 'priority-processing', 'bulk-operations']
  }
}
```

**Subscription Validation**:
```javascript
const isActive = user.subscription.expiresAt > new Date();
const hasFeature = user.subscription.plan !== 'free';
```

## 🏥 Health Monitoring

**Health Check** (`GET /health`):
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "redis": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Health Indicators**:
- MongoDB connection status
- Redis connectivity
- Response time metrics
- Error rate monitoring

## ⚙️ Configuration

**Environment Variables**:
```bash
# Server
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/anatome-ai

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Security
JWT_SECRET=your-super-secret-key-256-bits
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

**Security Configuration**:
- JWT secrets must be 256+ bits
- Redis password protection
- Environment-based secrets
- HTTPS in production

## 🚀 Development

**Setup**:
```bash
cd services/user-management
npm install
npm run dev
```

**Database Setup**:
```bash
# MongoDB indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ 'subscription.plan': 1 })
db.users.createIndex({ createdAt: -1 })
```

**Docker**:
```bash
docker build -t anatome-user-management .
docker run -p 3001:3001 anatome-user-management
```

## 🧪 Testing

**Unit Tests**:
```bash
npm test
```

**Test Categories**:
- Authentication flows
- Token validation
- Session management
- Password security
- Admin operations

**Example Test**:
```javascript
describe('User Registration', () => {
  it('should create user and return tokens', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tokens.accessToken).toBeDefined();
  });
});
```

## 📊 Monitoring & Analytics

**Metrics Tracked**:
- User registrations per day
- Authentication success/failure rates
- Token refresh frequency
- Session duration analytics
- Password change frequency

**Performance Metrics**:
- Authentication response time
- Database query performance
- Redis operation latency
- Token validation speed

## 🔍 Logging

**Log Categories**:
- **Authentication**: Login attempts, registrations
- **Authorization**: Permission checks, role changes
- **Security**: Failed logins, password changes
- **Operations**: Profile updates, deletions

**Log Format**:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "info",
  "service": "user-management",
  "event": "user_login",
  "userId": "user123",
  "email": "user@example.com",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "success": true
}
```

## 🚨 Error Handling

**Common Errors**:

| Code | Status | Description |
|------|--------|-------------|
| `USER_EXISTS` | 409 | Email already registered |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `TOKEN_EXPIRED` | 401 | JWT token expired |
| `INVALID_TOKEN` | 401 | Malformed JWT token |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `WEAK_PASSWORD` | 400 | Password requirements not met |

**Security Responses**:
```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid credentials"
  }
}
```

## 🔒 Security Best Practices

**Implementation**:
- Password complexity validation
- Rate limiting on auth endpoints
- Account lockout after failed attempts
- Secure session management
- Token rotation and blacklisting

**Compliance**:
- GDPR data handling
- Secure credential storage
- Audit logging
- Data encryption at rest

## 📚 API Documentation

**Swagger**: Available through API Gateway at `/api/docs`

**Authentication Header**:
```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## 🤝 Contributing

1. Follow authentication security patterns
2. Add comprehensive input validation
3. Include security audit logging
4. Update JWT token handling
5. Add appropriate error responses

## 🔗 Related Services

- [API Gateway](./api-gateway.md) - Request routing and validation
- [Business Discovery](./business-discovery.md) - User business management
- [Video Scraping](./video-scraping.md) - User quota management

---

**Next**: [Business Discovery Service](./business-discovery.md)