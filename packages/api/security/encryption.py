"""Encryption at rest — protects sensitive data stored in the database.

Uses Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256).
Every piece of sensitive data (transcripts, task descriptions, knowledge entries)
is encrypted before writing to Postgres and decrypted when reading.

The encryption key is loaded from the ENCRYPTION_KEY environment variable.
If no key is set, one is auto-generated on startup (fine for dev, not for prod).

In production:
- Set ENCRYPTION_KEY via `fly secrets set` or your secrets manager
- Never commit the key to source control
- Rotate keys by re-encrypting all data with the new key
"""

import base64
import logging

from cryptography.fernet import Fernet

from config import settings

log = logging.getLogger("security.encryption")

# Initialize the Fernet cipher
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Get or create the Fernet cipher instance."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key = settings.encryption_key
    if not key:
        # Auto-generate for development — logs a warning
        key = Fernet.generate_key().decode()
        log.warning(
            "No ENCRYPTION_KEY set — auto-generated a temporary key. "
            "Data will NOT survive server restarts. Set ENCRYPTION_KEY in .env for persistence."
        )
    else:
        # Validate the key format
        try:
            # Key should be url-safe base64 encoded 32 bytes
            base64.urlsafe_b64decode(key)
        except Exception:
            raise ValueError(
                "ENCRYPTION_KEY is not a valid Fernet key. "
                "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            )

    _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    log.info("Encryption initialized")
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns a base64-encoded encrypted string.

    Safe to store in a Text column in Postgres.
    Returns empty string if input is empty.
    """
    if not plaintext:
        return ""
    f = _get_fernet()
    encrypted = f.encrypt(plaintext.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a string that was encrypted with encrypt().

    Returns the original plaintext.
    Returns empty string if input is empty.
    Falls back to returning the input unchanged if decryption fails
    (handles unencrypted legacy data).
    """
    if not ciphertext:
        return ""
    f = _get_fernet()
    try:
        decrypted = f.decrypt(ciphertext.encode("utf-8"))
        return decrypted.decode("utf-8")
    except Exception:
        # Data might not be encrypted (legacy/migration), return as-is
        log.debug("Decryption failed — returning data as-is (possibly unencrypted)")
        return ciphertext


def is_encrypted(text: str) -> bool:
    """Check if a string looks like Fernet-encrypted data.

    Fernet tokens start with 'gAAAAA' (base64 of version byte + timestamp).
    """
    return bool(text) and text.startswith("gAAAAA")


def generate_key() -> str:
    """Generate a new Fernet encryption key. Utility for setup."""
    return Fernet.generate_key().decode()
