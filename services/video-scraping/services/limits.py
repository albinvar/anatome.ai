from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from utils.logger import logger
from config import settings


class VideoLimitsService:
    """Service to handle video download limits based on user subscription"""
    
    def __init__(self, mongodb_client: AsyncIOMotorClient):
        self.mongodb = mongodb_client
        self.db = self.mongodb.anatome_ai
        
        # Subscription limits
        self.limits = {
            'free': settings.max_videos_free,
            'pro': settings.max_videos_pro,
            'enterprise': settings.max_videos_enterprise,
        }
    
    async def get_user_subscription(self, user_id: str) -> str:
        """Get user's subscription plan"""
        try:
            users_collection = self.db.users
            user = await users_collection.find_one({"_id": user_id})
            
            if not user:
                logger.warning(f"User not found: {user_id}")
                return 'free'  # Default to free
            
            return user.get('subscription', {}).get('plan', 'free')
            
        except Exception as e:
            logger.error(f"Error getting user subscription: {e}")
            return 'free'  # Default to free on error
    
    async def get_user_video_count(self, user_id: str) -> int:
        """Get current video count for user (this month)"""
        try:
            from datetime import datetime, timezone
            
            # Get current month start
            now = datetime.now(timezone.utc)
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            videos_collection = self.db.videos
            
            # Count videos created by user this month
            count = await videos_collection.count_documents({
                "user_id": user_id,  # Assuming we add user_id to videos
                "created_at": {"$gte": month_start}
            })
            
            return count
            
        except Exception as e:
            logger.error(f"Error getting user video count: {e}")
            return 0
    
    async def check_video_limit(self, user_id: str, requested_videos: int = 1) -> Dict[str, Any]:
        """Check if user can download requested number of videos"""
        try:
            subscription = await self.get_user_subscription(user_id)
            current_count = await self.get_user_video_count(user_id)
            limit = self.limits.get(subscription, self.limits['free'])
            
            can_download = (current_count + requested_videos) <= limit
            remaining = max(0, limit - current_count)
            
            return {
                'allowed': can_download,
                'current_count': current_count,
                'limit': limit,
                'remaining': remaining,
                'subscription': subscription,
                'requested': requested_videos,
            }
            
        except Exception as e:
            logger.error(f"Error checking video limit: {e}")
            return {
                'allowed': False,
                'current_count': 0,
                'limit': self.limits['free'],
                'remaining': 0,
                'subscription': 'free',
                'requested': requested_videos,
                'error': str(e),
            }
    
    async def increment_video_count(self, user_id: str, count: int = 1) -> bool:
        """Increment user's video count (called after successful download)"""
        try:
            # This could be implemented as a counter in Redis for better performance
            # or tracked in a separate usage collection
            logger.info(f"Video count incremented for user {user_id}: +{count}")
            return True
            
        except Exception as e:
            logger.error(f"Error incrementing video count: {e}")
            return False
    
    def get_subscription_limits(self) -> Dict[str, int]:
        """Get all subscription limits"""
        return self.limits.copy()
    
    async def get_user_usage_stats(self, user_id: str) -> Dict[str, Any]:
        """Get comprehensive usage statistics for user"""
        try:
            subscription = await self.get_user_subscription(user_id)
            current_count = await self.get_user_video_count(user_id)
            limit = self.limits.get(subscription, self.limits['free'])
            
            return {
                'user_id': user_id,
                'subscription': subscription,
                'current_month_downloads': current_count,
                'monthly_limit': limit,
                'remaining': max(0, limit - current_count),
                'usage_percentage': round((current_count / limit) * 100, 2) if limit > 0 else 0,
                'can_download': current_count < limit,
            }
            
        except Exception as e:
            logger.error(f"Error getting user usage stats: {e}")
            return {
                'user_id': user_id,
                'subscription': 'free',
                'current_month_downloads': 0,
                'monthly_limit': self.limits['free'],
                'remaining': self.limits['free'],
                'usage_percentage': 0,
                'can_download': True,
                'error': str(e),
            }