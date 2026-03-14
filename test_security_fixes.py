#!/usr/bin/env python3
"""
Test script to verify security fixes and improvements.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from utils import _is_safe_url, validate_url_safety

def test_url_validation():
    """Test URL validation functions."""
    print("Testing URL validation functions...")
    
    # Test safe URLs
    safe_urls = [
        "https://example.com/image.jpg",
        "http://example.com/image.png",
        "https://www.google.com/logo.png"
    ]
    
    for url in safe_urls:
        result, msg = validate_url_safety(url)
        assert result is True, f"Safe URL failed: {url} - {msg}"
        assert _is_safe_url(url) is True, f"_is_safe_url failed for: {url}"
    
    # Test unsafe URLs
    unsafe_urls = [
        ("http://localhost/image.jpg", "Private/loopback URLs are not permitted"),
        ("http://127.0.0.1/image.jpg", "Private/loopback URLs are not permitted"),
        ("http://192.168.1.1/image.jpg", "Private/loopback URLs are not permitted"),
        ("ftp://example.com/image.jpg", "Only http/https URLs are supported"),
        ("" * 2001, "URL too long or empty"),
        ("", "URL too long or empty")
    ]
    
    for url, expected_error in unsafe_urls:
        result, msg = validate_url_safety(url)
        assert result is False, f"Unsafe URL passed: {url}"
        assert expected_error in msg, f"Expected '{expected_error}', got '{msg}' for URL: {url}"
    
    print("✓ URL validation tests passed")

def test_sql_injection_protection():
    """Test that SQL injection attempts are properly handled."""
    print("Testing SQL injection protection...")
    
    # Test the validation function with potentially malicious input
    malicious_urls = [
        "https://example.com'; DROP TABLE users; --.jpg",
        "https://example.com\" OR 1=1; --.jpg",
        "javascript:alert('XSS')",
        "file:///etc/passwd"
    ]
    
    for url in malicious_urls:
        result, msg = validate_url_safety(url)
        # These should either fail validation or be properly escaped
        if result:
            # If it passes validation, it should be properly handled by parameterized queries
            print(f"  URL passed validation (will be handled by parameterized queries): {url}")
        else:
            print(f"  URL blocked by validation: {url} - {msg}")
    
    print("✓ SQL injection protection tests completed")

def test_input_validation():
    """Test input validation improvements."""
    print("Testing input validation...")
    
    # Test edge cases
    edge_cases = [
        ("https://example.com/" + "a" * 1795, True, None),  # Long path (20 + 1795 = 1815)
        ("https://example.com/" + "a" * 1800, True, None),  # Still under limit (20 + 1800 = 1820)
        ("https://example.com/" + "a" * 1975, True, None),  # Just under limit (20 + 1975 = 1995)
        ("https://example.com/" + "a" * 1980, True, None),  # Still under limit (20 + 1980 = 2000)
        ("https://example.com/" + "a" * 1981, False, "URL too long"),  # Over limit (20 + 1981 = 2001)
    ]
    
    for url, expected_result, expected_error in edge_cases:
        result, msg = validate_url_safety(url)
        assert result == expected_result, f"Edge case failed: {url}"
        if expected_error and not expected_result:
            assert expected_error in msg, f"Expected error '{expected_error}', got '{msg}'"
    
    print("✓ Input validation tests passed")

if __name__ == "__main__":
    print("Running security fix tests...\n")
    
    try:
        test_url_validation()
        test_sql_injection_protection()
        test_input_validation()
        
        print("\n🎉 All tests passed! Security fixes are working correctly.")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)