from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
)

Password = Annotated[str, StringConstraints(strip_whitespace=False)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(InputModel):
    email: EmailStr
    password: Password = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class Login(InputModel):
    email: EmailStr
    password: Password = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class Location(InputModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]

    @field_validator("coordinates")
    @classmethod
    def check_coordinates(cls, value):
        longitude, latitude = value
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            raise ValueError("Coordinates must be [longitude (-180..180), latitude (-90..90)]")
        return value


class ItemCreate(InputModel):
    kind: Literal["lost", "found"]
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=2000)
    category: str = Field(min_length=1, max_length=80)
    attributes: dict[str, str] = Field(default_factory=dict, max_length=30)
    images: list[HttpUrl] = Field(default_factory=list, max_length=8)
    location: Location

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value):
        return value.casefold()

    @field_validator("attributes")
    @classmethod
    def validate_attributes(cls, values):
        normalized = {}
        for key, value in values.items():
            key, value = key.strip().casefold(), value.strip()
            if not key or len(key) > 80 or not value or len(value) > 200:
                raise ValueError("Attribute keys must be 1..80 and values 1..200 characters")
            if "." in key or "$" in key or key in normalized:
                raise ValueError("Attribute keys must be unique and cannot contain '.' or '$'")
            normalized[key] = value
        return normalized


class ItemStatus(InputModel):
    status: Literal["open", "resolved"]


class ItemOut(BaseModel):
    id: str
    owner_id: str
    kind: Literal["lost", "found"]
    title: str
    description: str
    category: str
    attributes: dict[str, str]
    images: list[str]
    location: Location
    status: Literal["open", "resolved"]
    matching_status: Literal["pending", "completed", "failed"]
    created_at: datetime


class MemberOut(BaseModel):
    id: str
    display_name: str


class ConversationOut(BaseModel):
    id: str
    lost_id: str
    found_id: str
    members: list[MemberOut]
    score: float
    components: dict[str, float]
    created_at: datetime


class MessageCreate(InputModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    body: str
    created_at: datetime
