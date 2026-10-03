from pymongo import ASCENDING, DESCENDING, GEOSPHERE, TEXT


def create_indexes(db):
    db.users.create_index("email", unique=True)
    db.items.create_index([("kind", ASCENDING), ("status", ASCENDING)])
    db.items.create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    db.items.create_index([("location", GEOSPHERE)])
    db.items.create_index([("title", TEXT), ("description", TEXT)])
    db.conversations.create_index([("lost_id", ASCENDING), ("found_id", ASCENDING)], unique=True)
    db.conversations.create_index([("member_ids", ASCENDING), ("created_at", DESCENDING)])
    db.messages.create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])
