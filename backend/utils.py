import ipaddress
import mimetypes
import os
import socket
import urllib.parse
from typing import Tuple, Optional, Set

from constants import ALLOWED_IMAGE_EXTENSIONS


def _is_safe_url(url: str) -> bool:
    """Return False if the URL resolves to a private or loopback IP (SSRF guard)."""
    try:
        hostname = urllib.parse.urlparse(url).hostname or ""
        if not hostname:
            return False
        try:
            ip = ipaddress.ip_address(hostname)  # raw IP literal
            return not (ip.is_private or ip.is_loopback or ip.is_link_local)
        except ValueError:
            pass
        # Resolve all addresses (IPv4 and IPv6) to guard against IPv6 SSRF
        try:
            results = socket.getaddrinfo(hostname, None)
        except (socket.gaierror, socket.timeout, OSError):
            return False  # unresolvable hostname = block
        if not results:
            return False
        for _family, _type, _proto, _canonname, sockaddr in results:
            try:
                ip = ipaddress.ip_address(sockaddr[0])
            except ValueError:
                return False
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return False
        return True
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


def safe_image_ext(url: str, content_type: str, allowed: Set[str] = ALLOWED_IMAGE_EXTENSIONS) -> str:
    """Derive a safe file extension from content-type or URL, falling back to .jpg."""
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
    if ext in (".jpe", ""):
        url_ext = os.path.splitext(url.split("?")[0])[1].lower()
        ext = url_ext if url_ext in allowed else ".jpg"
    if ext not in allowed:
        ext = ".jpg"
    return ext
