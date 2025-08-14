from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


class ScrapingRequest(BaseModel):
    username: str = Field(..., description="Instagram username to scrape")
    social_profile_id: str = Field(..., description="Social profile ID from database")
    business_id: str = Field(..., description="Business ID from database")
    max_videos: int = Field(default=50, ge=1, le=100, description="Maximum number of videos to scrape")


class VideoCreate(BaseModel):
    social_profile_id: str = Field(..., description="Social profile ID")
    business_id: str = Field(..., description="Business ID")
    video_url: str = Field(..., description="Original Instagram video URL")
    thumbnail_url: str = Field(default="", description="Original thumbnail URL")
    s3_url: Optional[str] = Field(None, description="S3 URL for downloaded video")
    s3_thumbnail_url: Optional[str] = Field(None, description="S3 URL for thumbnail")
    caption: str = Field(default="", description="Video caption")
    likes: int = Field(default=0, ge=0, description="Number of likes")
    comments: int = Field(default=0, ge=0, description="Number of comments")
    shares: int = Field(default=0, ge=0, description="Number of shares")
    views: Optional[int] = Field(None, ge=0, description="Number of views")
    duration: float = Field(default=0.0, ge=0, description="Video duration in seconds")
    published_at: Optional[datetime] = Field(None, description="Original publication date")


class VideoResponse(VideoCreate):
    id: str = Field(..., description="Video ID")
    analysis_status: str = Field(default="pending", description="Analysis status")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class VideoInfo(BaseModel):
    id: str = Field(..., description="Instagram post ID")
    url: str = Field(..., description="Instagram video URL")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail URL")
    thumbnail_path: Optional[str] = Field(None, description="Local thumbnail path")
    caption: str = Field(default="", description="Video caption")
    likes: int = Field(default=0, description="Number of likes")
    comments: int = Field(default=0, description="Number of comments")
    shares: int = Field(default=0, description="Number of shares")
    views: Optional[int] = Field(None, description="Number of views")
    duration: float = Field(default=0.0, description="Video duration in seconds")
    published_at: Optional[datetime] = Field(None, description="Publication date")
    username: str = Field(..., description="Profile username")


class ProfileInfo(BaseModel):
    username: str = Field(..., description="Instagram username")
    full_name: str = Field(default="", description="Full name")
    biography: str = Field(default="", description="Biography")
    followers: int = Field(default=0, description="Number of followers")
    following: int = Field(default=0, description="Number of following")
    posts_count: int = Field(default=0, description="Number of posts")
    is_verified: bool = Field(default=False, description="Verification status")
    is_private: bool = Field(default=False, description="Privacy status")
    profile_pic_url: Optional[str] = Field(None, description="Profile picture URL")


class ScrapingStatus(BaseModel):
    username: str = Field(..., description="Instagram username")
    status: str = Field(..., description="Scraping status")
    progress: int = Field(default=0, ge=0, le=100, description="Progress percentage")
    total_videos: int = Field(default=0, description="Total videos found")
    scraped_videos: int = Field(default=0, description="Videos successfully scraped")
    failed_videos: int = Field(default=0, description="Videos that failed to scrape")
    started_at: Optional[datetime] = Field(None, description="Scraping start time")
    completed_at: Optional[datetime] = Field(None, description="Scraping completion time")
    error_message: Optional[str] = Field(None, description="Error message if failed")