#!/usr/bin/env python3
"""
Instagram Reel Metadata Extractor using Instaloader
Extracts metadata only (no downloads) for top-performing reels
"""

import instaloader
import json
import sys
import os
from datetime import datetime, timezone
import logging

# Configure logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)

class ReelExtractor:
    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_videos=False,
            download_video_thumbnails=False,
            download_comments=False,
            download_geotags=False,
            save_metadata=False,
            post_metadata_txt_pattern="",
        )
        
        # Load session if exists
        self._load_session()
    
    def _load_session(self):
        """Load Instagram session if available"""
        try:
            session_file = os.environ.get('INSTAGRAM_SESSION_FILE', './sessions/session.json')
            if os.path.exists(session_file):
                username = os.environ.get('INSTAGRAM_USERNAME', 'anonymous')
                self.loader.load_session_from_file(username, session_file)
                logger.info("Session loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load session: {e}")
    
    def extract_reel_metadata(self, username, max_reels=50):
        """Extract metadata for reels from a profile"""
        try:
            profile = instaloader.Profile.from_username(self.loader.context, username)
            
            if profile.is_private:
                logger.error(f"Profile @{username} is private")
                return []
            
            reels = []
            processed = 0
            
            # Iterate through posts and find video content
            for post in profile.get_posts():
                if processed >= max_reels:
                    break
                
                # Focus on video content (reels and IGTV)
                if post.is_video:
                    metadata = self._extract_post_metadata(post)
                    if metadata:
                        # Output as JSON line for Node.js to parse
                        print(json.dumps(metadata), flush=True)
                        reels.append(metadata)
                    
                    processed += 1
                
                # Rate limiting - small delay between requests
                import time
                time.sleep(0.5)
            
            return reels
            
        except instaloader.exceptions.ProfileNotExistsException:
            logger.error(f"Profile @{username} does not exist")
            return []
        except instaloader.exceptions.LoginRequiredException:
            logger.error("Login required for this profile")
            return []
        except Exception as e:
            logger.error(f"Error extracting reels for {username}: {e}")
            return []
    
    def _extract_post_metadata(self, post):
        """Extract metadata from a single post"""
        try:
            # Check if it's likely a reel (short video)
            is_reel = (
                post.is_video and 
                hasattr(post, 'video_duration') and 
                post.video_duration and 
                post.video_duration <= 90  # Reels are typically ≤90 seconds
            )
            
            metadata = {
                'shortcode': post.shortcode,
                'likes': post.likes,
                'comments': post.comments,
                'date_utc': post.date_utc.isoformat() if post.date_utc else None,
                'caption': post.caption[:500] if post.caption else '',  # Limit caption length
                'is_video': post.is_video,
                'is_reel': is_reel,
                'display_url': post.url,
            }
            
            # Video-specific metadata
            if post.is_video:
                if hasattr(post, 'video_duration') and post.video_duration:
                    metadata['video_duration'] = post.video_duration
                
                if hasattr(post, 'video_view_count') and post.video_view_count:
                    metadata['video_view_count'] = post.video_view_count
            
            # Additional engagement metrics if available
            if hasattr(post, 'likes'):
                metadata['likes'] = post.likes
            
            if hasattr(post, 'comments'):
                metadata['comments'] = post.comments
            
            return metadata
            
        except Exception as e:
            logger.error(f"Error extracting post metadata: {e}")
            return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Username required"}), file=sys.stderr)
        sys.exit(1)
    
    username = sys.argv[1]
    max_reels = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    
    try:
        extractor = ReelExtractor()
        reels = extractor.extract_reel_metadata(username, max_reels)
        
        # Output summary to stderr (won't interfere with JSON output)
        print(f"Extracted {len(reels)} reels for @{username}", file=sys.stderr)
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()