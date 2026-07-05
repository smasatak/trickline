"""S3-compatible object storage helpers (works with MinIO locally, R2 in prod).

The API server never handles video bytes: it only mints presigned PUT URLs
for the client to upload directly, and builds public playback URLs.
"""
import boto3
from botocore.client import Config

from .config import get_settings

settings = get_settings()

_client = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint_url,
    region_name=settings.s3_region,
    aws_access_key_id=settings.s3_access_key_id,
    aws_secret_access_key=settings.s3_secret_access_key,
    config=Config(signature_version="s3v4"),
)


def presign_put(object_key: str, content_type: str, expires: int = 900) -> str:
    return _client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )


def public_url(object_key: str | None) -> str | None:
    if not object_key:
        return None
    return f"{settings.s3_public_base_url.rstrip('/')}/{object_key}"
