import ipaddress
import socket
import urllib.parse
from typing import Tuple, Optional


def _is_safe_url(url: str) -> bool:
    """Return False if the URL resolves to a private or loopback IP (SSRF guard)."""
    try:
        hostname = urllib.parse.urlparse(url).hostname or ""
        if not hostname:
            return False
        try:
            ip = ipaddress.ip_address(hostname)  # raw IP literal
        except ValueError:
            try:
                ip = ipaddress.ip_address(socket.gethostbyname(hostname))
            except (socket.gaierror, socket.timeout, ValueError):
                return False  # unresolvable hostname = block
        return not (ip.is_private or ip.is_loopback or ip.is_link_local)
    except (socket.gaierror, socket.herror, socket.timeout, ValueError, OSError):
        return False


def validate_url_safety(url: str, max_length: int = 2000) -> Tuple[bool, Optional[str]]:
    """Validate URL safety and format.
    
    Args:
        url: URL to validate
        max_length: Maximum allowed URL length
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not url or len(url) > max_length:
        return False, "URL too long or empty"
    
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, "Only http/https URLs are supported"
    
    if not _is_safe_url(url):
        return False, "Private/loopback URLs are not permitted"
    
    return True, None
