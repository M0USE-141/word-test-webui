"""Access control service for test collections."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.models.db.test_collection import AccessLevel, TestCollection, TestShare
from api.models.db.user import User


def get_test_collection(db: DbSession, test_id: str) -> TestCollection | None:
    """Get test collection by test_id."""
    stmt = select(TestCollection).where(TestCollection.test_id == test_id)
    return db.execute(stmt).scalar_one_or_none()


def get_test_collection_with_owner(db: DbSession, test_id: str) -> TestCollection | None:
    """Get test collection with owner relationship loaded."""
    stmt = (
        select(TestCollection)
        .options(joinedload(TestCollection.owner))
        .where(TestCollection.test_id == test_id)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_or_create_collection(
    db: DbSession,
    test_id: str,
    owner_id: int,
    access_level: AccessLevel = AccessLevel.PRIVATE,
) -> TestCollection:
    """Get existing or create new test collection."""
    collection = get_test_collection(db, test_id)
    if collection:
        return collection

    collection = TestCollection(
        test_id=test_id,
        owner_id=owner_id,
        access_level=access_level.value,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection


def update_access_level(
    db: DbSession, test_id: str, access_level: AccessLevel
) -> TestCollection | None:
    """Update access level for a test collection."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return None

    collection.access_level = access_level.value
    collection.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(collection)
    return collection


def add_share(
    db: DbSession, test_id: str, user_id: int, shared_by: int
) -> TestShare | None:
    """Add a share for a user to a test collection."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return None

    # Check if share already exists
    stmt = select(TestShare).where(
        TestShare.test_collection_id == collection.id,
        TestShare.user_id == user_id,
    )
    existing = db.execute(stmt).scalar_one_or_none()
    if existing:
        return existing

    share = TestShare(
        test_collection_id=collection.id,
        user_id=user_id,
        shared_by=shared_by,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


def remove_share(db: DbSession, test_id: str, user_id: int) -> bool:
    """Remove a share for a user from a test collection."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return False

    stmt = select(TestShare).where(
        TestShare.test_collection_id == collection.id,
        TestShare.user_id == user_id,
    )
    share = db.execute(stmt).scalar_one_or_none()
    if not share:
        return False

    db.delete(share)
    db.commit()
    return True


def list_shares(db: DbSession, test_id: str) -> list[TestShare]:
    """List all shares for a test collection."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return []

    stmt = (
        select(TestShare)
        .options(
            joinedload(TestShare.user),
            joinedload(TestShare.shared_by_user),
        )
        .where(TestShare.test_collection_id == collection.id)
        .order_by(TestShare.shared_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def can_view_test(db: DbSession, test_id: str, user: User | None) -> bool:
    """Check if user can view a test."""
    collection = get_test_collection(db, test_id)

    # No collection record = test exists but no access control yet
    # For backwards compatibility, allow viewing
    if not collection:
        return True

    # PUBLIC tests are visible to everyone
    if collection.access_level == AccessLevel.PUBLIC.value:
        return True

    # User must be authenticated for PRIVATE and SHARED
    if not user:
        return False

    # Owner can always view
    if collection.owner_id == user.id:
        return True

    # SHARED tests are visible to shared users
    if collection.access_level == AccessLevel.SHARED.value:
        stmt = select(TestShare).where(
            TestShare.test_collection_id == collection.id,
            TestShare.user_id == user.id,
        )
        share = db.execute(stmt).scalar_one_or_none()
        return share is not None

    # PRIVATE tests are only visible to owner (already checked above)
    return False


def can_edit_test(db: DbSession, test_id: str, user: User) -> bool:
    """Check if user can edit a test (only owner can edit)."""
    collection = get_test_collection(db, test_id)

    # No collection record = treat as editable (backwards compatibility)
    if not collection:
        return True

    return collection.owner_id == user.id


def get_accessible_test_ids(
    db: DbSession,
    user: User | None,
    access_filter: AccessLevel | None = None,
    owned_only: bool = False,
) -> list[str]:
    """Get list of test_ids accessible by user."""
    if owned_only and not user:
        return []

    result = set()

    if user:
        # Tests owned by user
        stmt = select(TestCollection.test_id).where(TestCollection.owner_id == user.id)
        if access_filter:
            stmt = stmt.where(TestCollection.access_level == access_filter.value)
        owned = db.execute(stmt).scalars().all()
        result.update(owned)

        if not owned_only:
            # Tests shared with user
            if not access_filter or access_filter == AccessLevel.SHARED:
                stmt = (
                    select(TestCollection.test_id)
                    .join(TestShare, TestShare.test_collection_id == TestCollection.id)
                    .where(
                        TestShare.user_id == user.id,
                        TestCollection.access_level == AccessLevel.SHARED.value,
                    )
                )
                shared = db.execute(stmt).scalars().all()
                result.update(shared)

    if not owned_only:
        # Public tests (visible to everyone)
        if not access_filter or access_filter == AccessLevel.PUBLIC:
            stmt = select(TestCollection.test_id).where(
                TestCollection.access_level == AccessLevel.PUBLIC.value
            )
            public = db.execute(stmt).scalars().all()
            result.update(public)

    return list(result)


def delete_test_collection(db: DbSession, test_id: str) -> bool:
    """Delete test collection and all its shares."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return False

    db.delete(collection)
    db.commit()
    return True
