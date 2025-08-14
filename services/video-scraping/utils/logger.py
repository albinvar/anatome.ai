import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler

from config import settings


def setup_logger(name: str = "video-scraping") -> logging.Logger:
    """Setup logger with appropriate configuration"""
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    
    # Prevent duplicate handlers
    if logger.handlers:
        return logger
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s'
    )
    
    simple_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    
    if settings.environment == "development":
        console_handler.setFormatter(detailed_formatter)
    else:
        console_handler.setFormatter(simple_formatter)
    
    logger.addHandler(console_handler)
    
    # File handlers for production
    if settings.environment == "production":
        # Create logs directory
        logs_dir = "logs"
        os.makedirs(logs_dir, exist_ok=True)
        
        # Error log file
        error_handler = RotatingFileHandler(
            os.path.join(logs_dir, f"{name}-error.log"),
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(detailed_formatter)
        logger.addHandler(error_handler)
        
        # Combined log file
        combined_handler = RotatingFileHandler(
            os.path.join(logs_dir, f"{name}-combined.log"),
            maxBytes=50 * 1024 * 1024,  # 50MB
            backupCount=10,
            encoding='utf-8'
        )
        combined_handler.setLevel(logging.INFO)
        combined_handler.setFormatter(detailed_formatter)
        logger.addHandler(combined_handler)
    
    return logger


# Create global logger instance
logger = setup_logger()


class LoggerMixin:
    """Mixin class to add logging capabilities to any class"""
    
    @property
    def logger(self) -> logging.Logger:
        if not hasattr(self, '_logger'):
            self._logger = logging.getLogger(f"{self.__class__.__module__}.{self.__class__.__name__}")
        return self._logger
    
    def log_info(self, message: str, **kwargs):
        """Log info message with optional metadata"""
        self.logger.info(message, extra=kwargs)
    
    def log_error(self, message: str, error: Exception = None, **kwargs):
        """Log error message with optional exception"""
        extra = kwargs.copy()
        if error:
            extra['error'] = str(error)
            extra['error_type'] = type(error).__name__
        
        self.logger.error(message, extra=extra, exc_info=error is not None)
    
    def log_warning(self, message: str, **kwargs):
        """Log warning message with optional metadata"""
        self.logger.warning(message, extra=kwargs)
    
    def log_debug(self, message: str, **kwargs):
        """Log debug message with optional metadata"""
        self.logger.debug(message, extra=kwargs)


def log_function_call(func_name: str, args: dict = None, result: any = None, error: Exception = None):
    """Log function call details"""
    log_data = {
        'function': func_name,
        'timestamp': datetime.utcnow().isoformat(),
    }
    
    if args:
        # Filter out sensitive data
        safe_args = {}
        for key, value in args.items():
            if key.lower() in ['password', 'token', 'key', 'secret']:
                safe_args[key] = '[REDACTED]'
            else:
                safe_args[key] = str(value)[:100]  # Truncate long values
        log_data['args'] = safe_args
    
    if error:
        logger.error(f"Function {func_name} failed", extra={**log_data, 'error': str(error)})
    else:
        if result is not None:
            log_data['result'] = str(result)[:100]  # Truncate long results
        logger.info(f"Function {func_name} completed", extra=log_data)


def log_api_request(method: str, url: str, status_code: int = None, response_time: float = None, error: Exception = None):
    """Log API request details"""
    log_data = {
        'method': method,
        'url': url,
        'timestamp': datetime.utcnow().isoformat(),
    }
    
    if status_code:
        log_data['status_code'] = status_code
    
    if response_time:
        log_data['response_time_ms'] = round(response_time * 1000, 2)
    
    if error:
        logger.error(f"API request failed: {method} {url}", extra={**log_data, 'error': str(error)})
    else:
        level = logging.ERROR if status_code and status_code >= 400 else logging.INFO
        logger.log(level, f"API request: {method} {url}", extra=log_data)