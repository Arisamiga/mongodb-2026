from pydantic import Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "lost_found"
    jwt_secret: str = Field(min_length=32)
    jwt_ttl_minutes: int = Field(default=60, ge=1, le=1440)
    match_threshold: float = Field(default=0.90, ge=0.90, lt=1)
    ai_service_url: HttpUrl = "http://ai:8001"
    ai_embedding_path: str = "/embeddings"
    ai_matches_path: str = "/matches"
    ai_timeout_seconds: float = Field(default=30, gt=0, le=120)
    ai_service_token: str | None = None
    cors_origins: list[str] = []

    @field_validator("ai_embedding_path", "ai_matches_path")
    @classmethod
    def relative_path(cls, value):
        if not value.startswith("/") or value.startswith("//") or "?" in value or "#" in value:
            raise ValueError("AI endpoint paths must start with a single slash")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if len(value.strip()) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 non-padding characters")
        return value
