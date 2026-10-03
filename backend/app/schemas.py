from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)

Password = Annotated[str, StringConstraints(strip_whitespace=False)]
Category = Literal["Electronics", "Clothing", "Bags", "Keys", "Cards and IDs", "Books", "Other"]
ReportStatus = Literal["open", "matched", "returned"]
ReportType = Literal["lost", "found"]


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
    coordinates: tuple[Annotated[float, Field(strict=True)], Annotated[float, Field(strict=True)]]

    @field_validator("coordinates")
    @classmethod
    def check_coordinates(cls, value):
        longitude, latitude = value
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            raise ValueError("Coordinates must be [longitude (-180..180), latitude (-90..90)]")
        return value


class ItemCreate(InputModel):
    type: ReportType
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=2000)
    category: Category
    attributes: dict[str, str] = Field(default_factory=dict, max_length=30)
    location: Location
    eventDate: datetime

    @field_validator("eventDate", mode="before")
    @classmethod
    def require_date(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("eventDate must be an ISO 8601 datetime with timezone")
        return value

    @field_validator("eventDate")
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None:
            raise ValueError("eventDate must include a timezone")
        return value

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
    status: ReportStatus


class ItemOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
    userId: str
    type: ReportType
    title: str
    description: str
    category: Category
    attributes: dict[str, str] = Field(default_factory=dict)
    images: list[str] = Field(default_factory=list)
    location: Location
    status: ReportStatus
    matchingStatus: Literal["pending", "completed", "failed"] = "pending"
    eventDate: datetime
    createdAt: datetime


class MemberOut(BaseModel):
    id: str
    display_name: str


class ConversationOut(BaseModel):
    id: str
    lost_id: str
    found_id: str
    members: list[MemberOut]
    score: float
    created_at: datetime


class MatchOut(BaseModel):
    item: ItemOut
    score: float
    conversation: ConversationOut


class MessageCreate(InputModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    body: str
    created_at: datetime
