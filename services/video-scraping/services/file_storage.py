import os
import asyncio
from typing import Optional
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import aiofiles

from utils.logger import logger
from config import settings


class S3Storage:
    def __init__(self):
        self.bucket_name = settings.s3_bucket_name
        self.region = settings.aws_region
        
        # Initialize S3 client
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region_name=settings.aws_region,
            )
            
            # Test credentials
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            self.is_configured = True
            logger.info(f"S3 storage initialized with bucket: {self.bucket_name}")
            
        except (ClientError, NoCredentialsError) as e:
            logger.warning(f"S3 not configured or accessible: {e}")
            self.s3_client = None
            self.is_configured = False
    
    def is_healthy(self) -> bool:
        """Check if S3 storage is healthy"""
        if not self.is_configured or not self.s3_client:
            return False
        
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False
    
    async def upload_video(self, local_path: str, s3_key: str) -> Optional[str]:
        """Upload video file to S3"""
        if not self.is_configured:
            logger.warning("S3 not configured, skipping upload")
            return None
        
        try:
            # Ensure the file exists
            if not os.path.exists(local_path):
                logger.error(f"Local file not found: {local_path}")
                return None
            
            # Upload file
            await self._upload_file_async(local_path, s3_key, 'video/mp4')
            
            # Generate public URL
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Video uploaded successfully: {url}")
            return url
            
        except Exception as e:
            logger.error(f"Error uploading video to S3: {e}")
            return None
    
    async def upload_image(self, local_path: str, s3_key: str) -> Optional[str]:
        """Upload image file to S3"""
        if not self.is_configured:
            logger.warning("S3 not configured, skipping upload")
            return None
        
        try:
            # Ensure the file exists
            if not os.path.exists(local_path):
                logger.error(f"Local file not found: {local_path}")
                return None
            
            # Determine content type
            content_type = 'image/jpeg'
            if local_path.lower().endswith('.png'):
                content_type = 'image/png'
            elif local_path.lower().endswith('.webp'):
                content_type = 'image/webp'
            
            # Upload file
            await self._upload_file_async(local_path, s3_key, content_type)
            
            # Generate public URL
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Image uploaded successfully: {url}")
            return url
            
        except Exception as e:
            logger.error(f"Error uploading image to S3: {e}")
            return None
    
    async def _upload_file_async(self, local_path: str, s3_key: str, content_type: str):
        """Upload file to S3 asynchronously"""
        def upload_sync():
            extra_args = {
                'ContentType': content_type,
                'CacheControl': 'max-age=31536000',  # 1 year cache
            }
            
            # Make videos public, but not images (for privacy)
            if content_type.startswith('video/'):
                extra_args['ACL'] = 'public-read'
            
            self.s3_client.upload_file(
                local_path,
                self.bucket_name,
                s3_key,
                ExtraArgs=extra_args
            )
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, upload_sync)
    
    async def delete_file(self, s3_url: str) -> bool:
        """Delete file from S3"""
        if not self.is_configured:
            logger.warning("S3 not configured, skipping deletion")
            return False
        
        try:
            # Extract S3 key from URL
            s3_key = self._extract_s3_key_from_url(s3_url)
            if not s3_key:
                logger.error(f"Could not extract S3 key from URL: {s3_url}")
                return False
            
            # Delete file
            def delete_sync():
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, delete_sync)
            
            logger.info(f"File deleted successfully: {s3_key}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting file from S3: {e}")
            return False
    
    async def get_file_info(self, s3_url: str) -> Optional[dict]:
        """Get file information from S3"""
        if not self.is_configured:
            return None
        
        try:
            s3_key = self._extract_s3_key_from_url(s3_url)
            if not s3_key:
                return None
            
            def get_info_sync():
                response = self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
                return {
                    'size': response.get('ContentLength', 0),
                    'content_type': response.get('ContentType', ''),
                    'last_modified': response.get('LastModified'),
                    'etag': response.get('ETag', '').strip('"'),
                }
            
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, get_info_sync)
            
            return info
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                logger.warning(f"File not found in S3: {s3_url}")
            else:
                logger.error(f"Error getting file info from S3: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting file info from S3: {e}")
            return None
    
    async def generate_presigned_url(self, s3_url: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for private file access"""
        if not self.is_configured:
            return None
        
        try:
            s3_key = self._extract_s3_key_from_url(s3_url)
            if not s3_key:
                return None
            
            def generate_url_sync():
                return self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': self.bucket_name, 'Key': s3_key},
                    ExpiresIn=expiration
                )
            
            loop = asyncio.get_event_loop()
            presigned_url = await loop.run_in_executor(None, generate_url_sync)
            
            return presigned_url
            
        except Exception as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None
    
    def _extract_s3_key_from_url(self, s3_url: str) -> Optional[str]:
        """Extract S3 key from S3 URL"""
        try:
            # Handle different S3 URL formats
            if f"{self.bucket_name}.s3.{self.region}.amazonaws.com" in s3_url:
                return s3_url.split(f"{self.bucket_name}.s3.{self.region}.amazonaws.com/")[1]
            elif f"s3.{self.region}.amazonaws.com/{self.bucket_name}" in s3_url:
                return s3_url.split(f"s3.{self.region}.amazonaws.com/{self.bucket_name}/")[1]
            elif f"s3://{self.bucket_name}/" in s3_url:
                return s3_url.split(f"s3://{self.bucket_name}/")[1]
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting S3 key from URL {s3_url}: {e}")
            return None
    
    async def list_files(self, prefix: str = "", max_keys: int = 1000) -> list:
        """List files in S3 bucket"""
        if not self.is_configured:
            return []
        
        try:
            def list_sync():
                paginator = self.s3_client.get_paginator('list_objects_v2')
                pages = paginator.paginate(
                    Bucket=self.bucket_name,
                    Prefix=prefix,
                    MaxKeys=max_keys
                )
                
                files = []
                for page in pages:
                    if 'Contents' in page:
                        for obj in page['Contents']:
                            files.append({
                                'key': obj['Key'],
                                'size': obj['Size'],
                                'last_modified': obj['LastModified'],
                                'url': f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{obj['Key']}"
                            })
                
                return files
            
            loop = asyncio.get_event_loop()
            files = await loop.run_in_executor(None, list_sync)
            
            return files
            
        except Exception as e:
            logger.error(f"Error listing files in S3: {e}")
            return []
    
    def get_storage_stats(self) -> dict:
        """Get storage statistics"""
        return {
            "configured": self.is_configured,
            "bucket": self.bucket_name,
            "region": self.region,
            "healthy": self.is_healthy(),
        }