from pymongo import ASCENDING, DESCENDING, TEXT


def create_indexes(db):
    db.users.create_index("email", unique=True)
    db.items.create_index([("type", ASCENDING), ("status", ASCENDING)])
    db.items.create_index([("userId", ASCENDING), ("createdAt", DESCENDING)])
    db.items.create_index([("location.coordinates", "2d")])
    db.items.create_index([("title", TEXT), ("description", TEXT)])
    db.conversations.create_index([("lost_id", ASCENDING), ("found_id", ASCENDING)], unique=True)
    db.conversations.create_index([("member_ids", ASCENDING), ("created_at", DESCENDING)])
    db.messages.create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])
    db.images.files.create_index("metadata.itemId")
