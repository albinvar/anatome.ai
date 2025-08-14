import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # MongoDB settings
    mongodb_uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017/anatome-ai")
    
    # Redis settings
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD")
    
    # Backblaze B2 settings (S3-compatible)
    b2_endpoint_url: str = os.getenv("B2_ENDPOINT_URL", "https://s3.us-west-002.backblazeb2.com")
    b2_access_key_id: str = os.getenv("B2_ACCESS_KEY_ID", "")
    b2_secret_access_key: str = os.getenv("B2_SECRET_ACCESS_KEY", "")
    b2_region: str = os.getenv("B2_REGION", "us-west-002")
    b2_bucket_name: str = os.getenv("B2_BUCKET_NAME", "anatome-ai-videos")
    
    # Legacy AWS S3 support (fallback)
    aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    s3_bucket_name: str = os.getenv("S3_BUCKET_NAME", "anatome-ai-videos")
    
    # Instagram settings
    instagram_username: Optional[str] = os.getenv("INSTAGRAM_USERNAME")
    instagram_password: Optional[str] = os.getenv("INSTAGRAM_PASSWORD")
    instagram_session_file: str = os.getenv("INSTAGRAM_SESSION_FILE", "./sessions/instagram_session.json")
    
    # Proxy settings
    use_proxy: bool = os.getenv("USE_PROXY", "false").lower() == "true"
    proxy_list: Optional[str] = os.getenv("PROXY_LIST")
    
    # Rate limiting
    max_requests_per_hour: int = int(os.getenv("MAX_REQUESTS_PER_HOUR", "30"))
    delay_between_requests: float = float(os.getenv("DELAY_BETWEEN_REQUESTS", "2.0"))
    
    # Video download limits per subscription
    max_videos_free: int = int(os.getenv("MAX_VIDEOS_FREE", "50"))
    max_videos_pro: int = int(os.getenv("MAX_VIDEOS_PRO", "200"))
    max_videos_enterprise: int = int(os.getenv("MAX_VIDEOS_ENTERPRISE", "1000"))
    
    # File paths
    temp_dir: str = os.getenv("TEMP_DIR", "./temp")
    sessions_dir: str = os.getenv("SESSIONS_DIR", "./sessions")
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Service settings
    environment: str = os.getenv("ENVIRONMENT", "development")
    port: int = int(os.getenv("PORT", "8001"))
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()