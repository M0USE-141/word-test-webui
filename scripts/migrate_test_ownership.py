#!/usr/bin/env python3
"""
Data migration script to assign ownership to existing tests.

This script:
1. Finds the first user by created_at (admin/default user)
2. For each test in data/tests/, creates a TestCollection with access_level=public
3. Skips tests that already have collections

Usage:
    python scripts/migrate_test_ownership.py
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timezone

from sqlalchemy import select

from api.config import DATA_DIR
from api.database import SessionLocal
from api.models.db.user import User
from api.models.db.test_collection import TestCollection, AccessLevel


def get_first_user(db):
    """Get the first user by created_at (oldest user)."""
    stmt = select(User).order_by(User.created_at.asc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def get_existing_test_ids(db):
    """Get set of test_ids that already have collections."""
    stmt = select(TestCollection.test_id)
    result = db.execute(stmt).scalars().all()
    return set(result)


def get_file_based_test_ids():
    """Get list of test IDs from filesystem."""
    test_ids = []
    if not DATA_DIR.exists():
        return test_ids

    for test_directory in DATA_DIR.iterdir():
        if not test_directory.is_dir():
            continue
        payload_file = test_directory / "test.json"
        if not payload_file.exists():
            continue
        test_ids.append(test_directory.name)

    return test_ids


def migrate_tests():
    """Main migration function."""
    db = SessionLocal()
    try:
        # Get default owner
        default_owner = get_first_user(db)
        if not default_owner:
            print("ERROR: No users found in database. Please create a user first.")
            print("You can register a user through the web interface.")
            return False

        print(f"Using user '{default_owner.username}' (ID: {default_owner.id}) as default owner")

        # Get existing collections
        existing_ids = get_existing_test_ids(db)
        print(f"Found {len(existing_ids)} existing test collections")

        # Get file-based tests
        file_test_ids = get_file_based_test_ids()
        print(f"Found {len(file_test_ids)} tests in filesystem")

        # Find tests that need migration
        tests_to_migrate = [tid for tid in file_test_ids if tid not in existing_ids]
        print(f"Tests to migrate: {len(tests_to_migrate)}")

        if not tests_to_migrate:
            print("No tests need migration. All done!")
            return True

        # Create collections for each test
        now = datetime.now(timezone.utc)
        migrated_count = 0

        for test_id in tests_to_migrate:
            collection = TestCollection(
                test_id=test_id,
                owner_id=default_owner.id,
                access_level=AccessLevel.PUBLIC.value,
                created_at=now,
                updated_at=now,
            )
            db.add(collection)
            migrated_count += 1
            print(f"  Created collection for test: {test_id}")

        db.commit()
        print(f"\nSuccessfully migrated {migrated_count} tests")
        return True

    except Exception as e:
        db.rollback()
        print(f"ERROR: Migration failed: {e}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print("=== Test Ownership Migration ===\n")
    success = migrate_tests()
    sys.exit(0 if success else 1)
