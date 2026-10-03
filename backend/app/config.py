from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "lost_found"
    jwt_secret: str = Field(min_length=32)
    jwt_ttl_minutes: int = Field(default=60, ge=1, le=1440)
    match_threshold: float = Field(default=0.78, ge=0, le=1)
    match_distance_scale_km: float = Field(default=5, gt=0)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    cors_origins: list[str] = []

    @field_validator("jwt_secret")
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if len(value.strip()) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 non-padding characters")
        return value
