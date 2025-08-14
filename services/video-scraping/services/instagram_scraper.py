import asyncio
import os
import json
import time
import random
from datetime import datetime
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse

import instaloader
from instaloader import Post, Profile
import requests
from PIL import Image

from models.video import VideoInfo, ProfileInfo
from utils.logger import logger
from config import settings


class InstagramScraper:
    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_videos=True,
            download_video_thumbnails=True,
            download_comments=False,
            save_metadata=False,
            post_metadata_txt_pattern="",
            download_geotags=False,
            dirname_pattern=settings.temp_dir + "/{target}",
        )
        
        # Create necessary directories
        os.makedirs(settings.temp_dir, exist_ok=True)
        os.makedirs(settings.sessions_dir, exist_ok=True)
        
        # Load session if exists
        self.session_loaded = False
        self._load_session()
        
        # Rate limiting
        self.last_request_time = 0
        self.requests_this_hour = 0
        self.hour_start = time.time()
    
    def _load_session(self):
        """Load Instagram session from file"""
        try:
            if os.path.exists(settings.instagram_session_file):
                self.loader.load_session_from_file(
                    username=settings.instagram_username or "anonymous",
                    filename=settings.instagram_session_file
                )
                self.session_loaded = True
                logger.info("Instagram session loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load Instagram session: {e}")
            self.session_loaded = False
    
    def _save_session(self):
        """Save Instagram session to file"""
        try:
            if settings.instagram_username:
                self.loader.save_session_to_file(
                    filename=settings.instagram_session_file
                )
                logger.info("Instagram session saved successfully")
        except Exception as e:
            logger.warning(f"Failed to save Instagram session: {e}")
    
    async def _rate_limit(self):
        """Apply rate limiting"""
        current_time = time.time()
        
        # Reset counter if hour has passed
        if current_time - self.hour_start > 3600:
            self.requests_this_hour = 0
            self.hour_start = current_time
        
        # Check hourly limit
        if self.requests_this_hour >= settings.max_requests_per_hour:
            wait_time = 3600 - (current_time - self.hour_start)
            logger.warning(f"Rate limit reached, waiting {wait_time:.0f} seconds")
            await asyncio.sleep(wait_time)
            self.requests_this_hour = 0
            self.hour_start = time.time()
        
        # Check delay between requests
        time_since_last = current_time - self.last_request_time
        if time_since_last < settings.delay_between_requests:
            wait_time = settings.delay_between_requests - time_since_last
            await asyncio.sleep(wait_time)
        
        # Add random delay to appear more human-like
        random_delay = random.uniform(0.5, 1.5)
        await asyncio.sleep(random_delay)
        
        self.requests_this_hour += 1
        self.last_request_time = time.time()
    
    def is_healthy(self) -> bool:
        """Check if the scraper is healthy"""
        return True  # Basic implementation
    
    async def get_profile_info(self, username: str) -> Optional[ProfileInfo]:
        """Get Instagram profile information"""
        try:
            await self._rate_limit()
            
            profile = Profile.from_username(self.loader.context, username)
            
            return ProfileInfo(
                username=profile.username,
                full_name=profile.full_name,
                biography=profile.biography,
                followers=profile.followers,
                following=profile.followees,
                posts_count=profile.mediacount,
                is_verified=profile.is_verified,
                is_private=profile.is_private,
                profile_pic_url=profile.profile_pic_url,
            )
        
        except Exception as e:
            logger.error(f"Error getting profile info for {username}: {e}")
            return None
    
    async def get_profile_videos(self, username: str, max_videos: int = 50) -> List[VideoInfo]:
        """Get videos from Instagram profile"""
        try:
            await self._rate_limit()
            
            profile = Profile.from_username(self.loader.context, username)
            
            if profile.is_private:
                logger.warning(f"Profile @{username} is private")
                return []
            
            videos = []
            processed = 0
            
            for post in profile.get_posts():
                if processed >= max_videos:
                    break
                
                if post.is_video:
                    video_info = await self._extract_video_info(post, username)
                    if video_info:
                        videos.append(video_info)
                    processed += 1
                    
                    # Rate limit between posts
                    if processed % 5 == 0:
                        await asyncio.sleep(random.uniform(2, 4))
            
            logger.info(f"Found {len(videos)} videos for @{username}")
            return videos
        
        except Exception as e:
            logger.error(f"Error getting videos for {username}: {e}")
            return []
    
    async def get_video_info(self, video_url: str) -> Optional[VideoInfo]:
        """Get information about a specific video"""
        try:
            await self._rate_limit()
            
            # Extract shortcode from URL
            shortcode = self._extract_shortcode(video_url)
            if not shortcode:
                logger.error(f"Could not extract shortcode from URL: {video_url}")
                return None
            
            post = Post.from_shortcode(self.loader.context, shortcode)
            
            if not post.is_video:
                logger.warning(f"Post is not a video: {video_url}")
                return None
            
            return await self._extract_video_info(post)
        
        except Exception as e:
            logger.error(f"Error getting video info for {video_url}: {e}")
            return None
    
    async def download_video(self, video_url: str) -> Optional[str]:
        """Download a single video and return local path"""
        try:
            await self._rate_limit()
            
            shortcode = self._extract_shortcode(video_url)
            if not shortcode:
                return None
            
            post = Post.from_shortcode(self.loader.context, shortcode)
            
            if not post.is_video:
                logger.warning(f"Post is not a video: {video_url}")
                return None
            
            # Create temporary directory for this download
            temp_dir = os.path.join(settings.temp_dir, f"video_{shortcode}")
            os.makedirs(temp_dir, exist_ok=True)
            
            # Download video
            self.loader.dirname_pattern = temp_dir
            self.loader.download_post(post, target=post.owner_username)
            
            # Find downloaded video file
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    if file.endswith('.mp4'):
                        video_path = os.path.join(root, file)
                        logger.info(f"Downloaded video: {video_path}")
                        return video_path
            
            logger.error(f"Video file not found after download: {video_url}")
            return None
        
        except Exception as e:
            logger.error(f"Error downloading video {video_url}: {e}")
            return None
    
    def _extract_shortcode(self, url: str) -> Optional[str]:
        """Extract Instagram shortcode from URL"""
        try:
            parsed = urlparse(url)
            path_parts = parsed.path.strip('/').split('/')
            
            # Handle different URL formats
            if 'p' in path_parts:
                idx = path_parts.index('p')
                if idx + 1 < len(path_parts):
                    return path_parts[idx + 1]
            elif 'reel' in path_parts:
                idx = path_parts.index('reel')
                if idx + 1 < len(path_parts):
                    return path_parts[idx + 1]
            elif len(path_parts) >= 2 and path_parts[0] == 'p':
                return path_parts[1]
            
            return None
        
        except Exception as e:
            logger.error(f"Error extracting shortcode from {url}: {e}")
            return None
    
    async def _extract_video_info(self, post: Post, username: str = None) -> Optional[VideoInfo]:
        """Extract video information from Instagram post"""
        try:
            # Get username
            post_username = username or post.owner_username
            
            # Build URL
            video_url = f"https://www.instagram.com/p/{post.shortcode}/"
            
            # Extract video duration (if available)
            duration = 0.0
            if hasattr(post, 'video_duration') and post.video_duration:
                duration = float(post.video_duration)
            
            # Get view count (may not be available)
            views = None
            if hasattr(post, 'video_view_count') and post.video_view_count:
                views = post.video_view_count
            
            return VideoInfo(
                id=post.shortcode,
                url=video_url,
                thumbnail_url=post.url if not post.is_video else None,
                caption=post.caption or "",
                likes=post.likes,
                comments=post.comments,
                shares=0,  # Not available in API
                views=views,
                duration=duration,
                published_at=post.date_utc,
                username=post_username,
            )
        
        except Exception as e:
            logger.error(f"Error extracting video info: {e}")
            return None
    
    async def login(self, username: str, password: str) -> bool:
        """Login to Instagram"""
        try:
            self.loader.login(username, password)
            self._save_session()
            self.session_loaded = True
            logger.info(f"Successfully logged in as {username}")
            return True
        
        except Exception as e:
            logger.error(f"Login failed for {username}: {e}")
            return False
    
    def logout(self):
        """Logout and clear session"""
        try:
            if os.path.exists(settings.instagram_session_file):
                os.remove(settings.instagram_session_file)
            self.session_loaded = False
            logger.info("Logged out successfully")
        
        except Exception as e:
            logger.error(f"Error during logout: {e}")
    
    async def test_connection(self) -> bool:
        """Test Instagram connection"""
        try:
            # Try to get a well-known profile
            await self._rate_limit()
            profile = Profile.from_username(self.loader.context, "instagram")
            return profile is not None
        
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False
    
    def cleanup_temp_files(self):
        """Clean up temporary files"""
        try:
            import shutil
            if os.path.exists(settings.temp_dir):
                for item in os.listdir(settings.temp_dir):
                    item_path = os.path.join(settings.temp_dir, item)
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                    else:
                        os.remove(item_path)
            logger.info("Temporary files cleaned up")
        
        except Exception as e:
            logger.error(f"Error cleaning up temp files: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get scraper statistics"""
        return {
            "session_loaded": self.session_loaded,
            "requests_this_hour": self.requests_this_hour,
            "rate_limit_active": self.requests_this_hour >= settings.max_requests_per_hour,
            "last_request": self.last_request_time,
        }