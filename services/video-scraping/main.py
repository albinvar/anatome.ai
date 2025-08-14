import asyncio
import os
from datetime import datetime
from typing import List, Optional, Dict, Any

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

from services.instagram_scraper import InstagramScraper
from services.file_storage import S3Storage
from services.limits import VideoLimitsService
from models.video import VideoCreate, VideoResponse, ScrapingRequest
from utils.logger import logger
from config import settings

app = FastAPI(
    title="Anatome.ai Video Scraping Service",
    description="Service for scraping Instagram videos and content",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {
            "name": "scraping",
            "description": "Instagram content scraping operations",
        },
        {
            "name": "videos",
            "description": "Video management operations",
        },
        {
            "name": "usage",
            "description": "Usage tracking and limits",
        },
        {
            "name": "health",
            "description": "Service health checks",
        },
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global clients
mongodb_client: Optional[AsyncIOMotorClient] = None
redis_client: Optional[redis.Redis] = None
instagram_scraper: Optional[InstagramScraper] = None
s3_storage: Optional[S3Storage] = None
limits_service: Optional[VideoLimitsService] = None


@app.on_event("startup")
async def startup_event():
    global mongodb_client, redis_client, instagram_scraper, s3_storage, limits_service
    
    # MongoDB connection
    mongodb_client = AsyncIOMotorClient(settings.mongodb_uri)
    
    # Redis connection
    redis_client = redis.from_url(
        f"redis://{settings.redis_host}:{settings.redis_port}",
        password=settings.redis_password,
        decode_responses=True,
    )
    
    # Initialize services
    instagram_scraper = InstagramScraper()
    s3_storage = S3Storage()
    limits_service = VideoLimitsService(mongodb_client)
    
    logger.info("Video Scraping service started successfully")


@app.on_event("shutdown")
async def shutdown_event():
    global mongodb_client, redis_client
    
    if mongodb_client:
        mongodb_client.close()
    
    if redis_client:
        await redis_client.close()
    
    logger.info("Video Scraping service shutdown completed")


@app.get("/health", tags=["health"])
async def health_check():
    checks = {
        "database": await check_mongodb_health(),
        "redis": await check_redis_health(),
        "instagram": instagram_scraper.is_healthy() if instagram_scraper else False,
        "s3": s3_storage.is_healthy() if s3_storage else False,
    }
    
    is_healthy = all(checks.values())
    
    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
    }


async def check_mongodb_health() -> bool:
    try:
        if not mongodb_client:
            return False
        await mongodb_client.admin.command('ping')
        return True
    except Exception:
        return False


async def check_redis_health() -> bool:
    try:
        if not redis_client:
            return False
        await redis_client.ping()
        return True
    except Exception:
        return False


def get_user_id(x_user_id: str = Header(...)) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User authentication required")
    return x_user_id


@app.post("/scrape/profile", response_model=dict, tags=["scraping"])
async def scrape_instagram_profile(
    request: ScrapingRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    """Scrape Instagram profile and queue video downloads"""
    try:
        if not instagram_scraper or not limits_service:
            raise HTTPException(status_code=503, detail="Services not available")
        
        # Validate Instagram username
        if not request.username.replace('_', '').replace('.', '').isalnum():
            raise HTTPException(status_code=400, detail="Invalid Instagram username")
        
        # Check video download limits
        limit_check = await limits_service.check_video_limit(user_id, request.max_videos)
        if not limit_check['allowed']:
            raise HTTPException(
                status_code=429, 
                detail={
                    "message": "Video download limit exceeded",
                    "current_count": limit_check['current_count'],
                    "limit": limit_check['limit'],
                    "remaining": limit_check['remaining'],
                    "subscription": limit_check['subscription'],
                }
            )
        
        # Start scraping in background
        background_tasks.add_task(
            process_profile_scraping,
            request.username,
            user_id,
            request.social_profile_id,
            request.business_id,
            min(request.max_videos, limit_check['remaining']),  # Don't exceed remaining limit
        )
        
        return {
            "success": True,
            "message": f"Started scraping profile @{request.username}",
            "username": request.username,
            "max_videos": min(request.max_videos, limit_check['remaining']),
            "remaining_quota": limit_check['remaining'],
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting profile scraping: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scrape/video", response_model=VideoResponse, tags=["scraping"])
async def scrape_single_video(
    url: str,
    business_id: str,
    social_profile_id: str,
    user_id: str = Depends(get_user_id),
):
    """Scrape a single Instagram video"""
    try:
        if not instagram_scraper:
            raise HTTPException(status_code=503, detail="Instagram scraper not available")
        
        # Extract video info
        video_info = await instagram_scraper.get_video_info(url)
        if not video_info:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Download video
        local_path = await instagram_scraper.download_video(url)
        
        # Upload to S3
        s3_url = None
        s3_thumbnail_url = None
        if s3_storage:
            s3_url = await s3_storage.upload_video(local_path, f"videos/{business_id}/{video_info['id']}.mp4")
            if video_info.get('thumbnail_path'):
                s3_thumbnail_url = await s3_storage.upload_image(
                    video_info['thumbnail_path'], 
                    f"thumbnails/{business_id}/{video_info['id']}.jpg"
                )
        
        # Save to database
        video_data = VideoCreate(
            social_profile_id=social_profile_id,
            business_id=business_id,
            video_url=url,
            thumbnail_url=video_info.get('thumbnail_url', ''),
            s3_url=s3_url,
            s3_thumbnail_url=s3_thumbnail_url,
            caption=video_info.get('caption', ''),
            likes=video_info.get('likes', 0),
            comments=video_info.get('comments', 0),
            shares=video_info.get('shares', 0),
            views=video_info.get('views'),
            duration=video_info.get('duration', 0),
            published_at=video_info.get('published_at'),
        )
        
        video = await save_video_to_db(video_data)
        
        # Clean up local files
        if os.path.exists(local_path):
            os.remove(local_path)
        
        return video
    
    except Exception as e:
        logger.error(f"Error scraping single video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/videos/{business_id}", tags=["videos"])
async def get_scraped_videos(
    business_id: str,
    skip: int = 0,
    limit: int = 20,
    user_id: str = Depends(get_user_id),
):
    """Get scraped videos for a business"""
    try:
        if not mongodb_client:
            raise HTTPException(status_code=503, detail="Database not available")
        
        db = mongodb_client.anatome_ai
        videos_collection = db.videos
        
        # Get videos
        cursor = videos_collection.find(
            {"business_id": business_id}
        ).sort("created_at", -1).skip(skip).limit(limit)
        
        videos = []
        async for video in cursor:
            video['id'] = str(video['_id'])
            del video['_id']
            videos.append(video)
        
        # Get total count
        total = await videos_collection.count_documents({"business_id": business_id})
        
        return {
            "success": True,
            "data": videos,
            "total": total,
            "skip": skip,
            "limit": limit,
        }
    
    except Exception as e:
        logger.error(f"Error getting videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/videos/{video_id}", tags=["videos"])
async def delete_video(
    video_id: str,
    user_id: str = Depends(get_user_id),
):
    """Delete a scraped video"""
    try:
        if not mongodb_client:
            raise HTTPException(status_code=503, detail="Database not available")
        
        db = mongodb_client.anatome_ai
        videos_collection = db.videos
        
        # Get video info first
        video = await videos_collection.find_one({"_id": video_id})
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Delete from S3 if exists
        if s3_storage and video.get('s3_url'):
            await s3_storage.delete_file(video['s3_url'])
        if s3_storage and video.get('s3_thumbnail_url'):
            await s3_storage.delete_file(video['s3_thumbnail_url'])
        
        # Delete from database
        result = await videos_collection.delete_one({"_id": video_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Video not found")
        
        return {
            "success": True,
            "message": "Video deleted successfully",
        }
    
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/usage", response_model=dict, tags=["usage"])
async def get_user_usage(user_id: str = Depends(get_user_id)):
    """Get user's video download usage statistics"""
    try:
        if not limits_service:
            raise HTTPException(status_code=503, detail="Limits service not available")
        
        usage_stats = await limits_service.get_user_usage_stats(user_id)
        
        return {
            "success": True,
            "data": usage_stats,
        }
    
    except Exception as e:
        logger.error(f"Error getting user usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/limits", response_model=dict, tags=["usage"])
async def get_subscription_limits():
    """Get all subscription tier limits"""
    try:
        if not limits_service:
            raise HTTPException(status_code=503, detail="Limits service not available")
        
        limits = limits_service.get_subscription_limits()
        
        return {
            "success": True,
            "data": {
                "limits": limits,
                "period": "monthly",
            },
        }
    
    except Exception as e:
        logger.error(f"Error getting subscription limits: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_profile_scraping(
    username: str,
    user_id: str,
    social_profile_id: str,
    business_id: str,
    max_videos: int = 50,
):
    """Background task to process profile scraping"""
    try:
        logger.info(f"Starting profile scraping for @{username}")
        
        if not instagram_scraper:
            logger.error("Instagram scraper not available")
            return
        
        # Get profile videos
        videos = await instagram_scraper.get_profile_videos(username, max_videos)
        
        logger.info(f"Found {len(videos)} videos for @{username}")
        
        for video_info in videos:
            try:
                # Check if video already exists
                if await video_exists(video_info['url']):
                    logger.info(f"Video already exists: {video_info['url']}")
                    continue
                
                # Download video
                local_path = await instagram_scraper.download_video(video_info['url'])
                if not local_path:
                    continue
                
                # Upload to S3
                s3_url = None
                s3_thumbnail_url = None
                if s3_storage:
                    s3_url = await s3_storage.upload_video(
                        local_path, 
                        f"videos/{business_id}/{video_info['id']}.mp4"
                    )
                    if video_info.get('thumbnail_path'):
                        s3_thumbnail_url = await s3_storage.upload_image(
                            video_info['thumbnail_path'], 
                            f"thumbnails/{business_id}/{video_info['id']}.jpg"
                        )
                
                # Save to database
                video_data = VideoCreate(
                    social_profile_id=social_profile_id,
                    business_id=business_id,
                    video_url=video_info['url'],
                    thumbnail_url=video_info.get('thumbnail_url', ''),
                    s3_url=s3_url,
                    s3_thumbnail_url=s3_thumbnail_url,
                    caption=video_info.get('caption', ''),
                    likes=video_info.get('likes', 0),
                    comments=video_info.get('comments', 0),
                    shares=video_info.get('shares', 0),
                    views=video_info.get('views'),
                    duration=video_info.get('duration', 0),
                    published_at=video_info.get('published_at'),
                )
                
                await save_video_to_db(video_data)
                
                # Clean up local files
                if os.path.exists(local_path):
                    os.remove(local_path)
                
                logger.info(f"Successfully processed video: {video_info['url']}")
                
            except Exception as e:
                logger.error(f"Error processing video {video_info.get('url', 'unknown')}: {e}")
                continue
        
        logger.info(f"Completed profile scraping for @{username}")
    
    except Exception as e:
        logger.error(f"Error in profile scraping: {e}")


async def save_video_to_db(video_data: VideoCreate) -> VideoResponse:
    """Save video data to database"""
    if not mongodb_client:
        raise Exception("Database not available")
    
    db = mongodb_client.anatome_ai
    videos_collection = db.videos
    
    video_dict = video_data.model_dump()
    video_dict['created_at'] = datetime.utcnow()
    video_dict['updated_at'] = datetime.utcnow()
    video_dict['analysis_status'] = 'pending'
    
    result = await videos_collection.insert_one(video_dict)
    
    video_dict['id'] = str(result.inserted_id)
    del video_dict['_id']
    
    return VideoResponse(**video_dict)


async def video_exists(video_url: str) -> bool:
    """Check if video already exists in database"""
    if not mongodb_client:
        return False
    
    db = mongodb_client.anatome_ai
    videos_collection = db.videos
    
    count = await videos_collection.count_documents({"video_url": video_url})
    return count > 0


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8001)),
        reload=True if os.getenv("ENVIRONMENT") == "development" else False,
    )