import ipaddress
import socket
import urllib.parse


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
            except (socket.gaierror, ValueError):
                return False  # unresolvable hostname = block
        return not (ip.is_private or ip.is_loopback or ip.is_link_local)
    except (socket.gaierror, socket.herror, ValueError, OSError):
        return False
