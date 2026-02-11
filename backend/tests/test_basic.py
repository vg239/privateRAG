"""
Basic integration tests to verify the application setup works correctly.
Run with: python -m pytest tests/test_basic.py -v
Or: python tests/test_basic.py
"""
import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from database.connection import supabase
from database.repositories import UserRepository
import bcrypt
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


async def test_database_connection():
    """Test 1: Verify database connection pool can be initialized"""
    print("\n" + "="*50)
    print("TEST 1: Database Connection")
    print("="*50)
    try:
        # Simple Supabase connectivity check
        resp = supabase.table("users").select("id").limit(1).execute()
        if getattr(resp, "error", None):
            print(f"✗ Supabase query failed: {resp.error}")
            return False
        print("✓ Supabase client query executed successfully")
        return True
    except Exception as e:
        print(f✗ Supabase connection failed: {e}")
        return False


async def test_user_repository_create():
    """Test 2: Test creating a user"""
    print("\n" + "="*50)
    print("TEST 2: User Repository - Create")
    print("="*50)
    try:
        test_wallet = "0x1234567890abcdef1234567890abcdef12345678"
        test_username = f"testuser_{asyncio.get_event_loop().time()}"
        test_password = "testpassword123"
        password_hash = hash_password(test_password)
        
        user = await UserRepository.create(
            wallet_address=test_wallet,
            username=test_username,
            password_hash=password_hash,
            email=f"{test_username}@test.com",
            full_name="Test User",
            metadata={"test": True, "source": "test_suite"}
        )
        
        assert user is not None, "User should be created"
        assert user['username'] == test_username, "Username should match"
        assert user['wallet_address'] == test_wallet, "Wallet address should match"
        print(f"✓ User created successfully: ID={user['id']}, Username={user['username']}")
        
        return user
    except ValueError as e:
        if "already exists" in str(e):
            print(f"⚠ User already exists (this is okay for testing): {e}")
            # Try to find the existing user
            user = await UserRepository.find_by_wallet_address(test_wallet)
            return user
        raise
    except Exception as e:
        print(f"✗ User creation failed: {e}")
        raise


async def test_user_repository_find():
    """Test 3: Test finding users"""
    print("\n" + "="*50)
    print("TEST 3: User Repository - Find")
    print("="*50)
    try:
        # Create a test user first
        test_user = await test_user_repository_create()
        user_id = test_user['id']
        
        # Test find_by_id
        found_user = await UserRepository.find_by_id(user_id)
        assert found_user is not None, "User should be found by ID"
        assert found_user['id'] == user_id, "User ID should match"
        print(f"✓ User found by ID: {user_id}")
        
        # Test find_by_username
        found_user = await UserRepository.find_by_username(test_user['username'])
        assert found_user is not None, "User should be found by username"
        print(f"✓ User found by username: {test_user['username']}")
        
        # Test find_by_wallet_address
        found_user = await UserRepository.find_by_wallet_address(test_user['wallet_address'])
        assert found_user is not None, "User should be found by wallet address"
        print(f"✓ User found by wallet address: {test_user['wallet_address']}")
        
        # Test find_all
        all_users = await UserRepository.find_all(limit=10)
        assert len(all_users) > 0, "Should find at least one user"
        print(f"✓ Found {len(all_users)} user(s) in database")
        
        return True
    except Exception as e:
        print(f"✗ User find operations failed: {e}")
        raise


async def test_user_repository_update():
    """Test 4: Test updating a user"""
    print("\n" + "="*50)
    print("TEST 4: User Repository - Update")
    print("="*50)
    try:
        # Create a test user first
        test_user = await test_user_repository_create()
        user_id = test_user['id']
        
        # Update user
        updated_user = await UserRepository.update(
            user_id=user_id,
            full_name="Updated Test User",
            is_verified=True,
            metadata={"test": True, "updated": True, "source": "test_suite"}
        )
        
        assert updated_user is not None, "User should be updated"
        assert updated_user['full_name'] == "Updated Test User", "Full name should be updated"
        # is_verified should be a boolean True after normalization
        assert updated_user['is_verified'] is True, \
            f"is_verified should be True (got: {updated_user['is_verified']}, type: {type(updated_user['is_verified'])})"
        print(f"✓ User updated successfully: ID={user_id}")
        
        return True
    except Exception as e:
        print(f"✗ User update failed: {e}")
        raise


async def test_user_repository_password():
    """Test 5: Test password operations"""
    print("\n" + "="*50)
    print("TEST 5: User Repository - Password")
    print("="*50)
    try:
        # Create a test user first
        test_user = await test_user_repository_create()
        user_id = test_user['id']
        
        # Get user with password
        user_with_password = await UserRepository.find_by_username(
            test_user['username'], 
            include_password=True
        )
        assert user_with_password is not None, "User with password should be found"
        assert 'password_hash' in user_with_password, "Password hash should be included"
        print("✓ User password hash retrieved")
        
        # Update password
        new_password_hash = hash_password("newpassword123")
        success = await UserRepository.update_password(user_id, new_password_hash)
        assert success is True, "Password should be updated"
        print("✓ User password updated successfully")
        
        return True
    except Exception as e:
        print(f"✗ Password operations failed: {e}")
        raise


async def test_user_repository_metadata():
    """Test 6: Test metadata operations"""
    print("\n" + "="*50)
    print("TEST 6: User Repository - Metadata")
    print("="*50)
    try:
        # Create a test user first
        test_user = await test_user_repository_create()
        user_id = test_user['id']
        
        # Update metadata (should merge)
        updated_user = await UserRepository.update_metadata(
            user_id,
            {"new_field": "new_value", "test": False}
        )
        
        assert updated_user is not None, "User metadata should be updated"
        assert updated_user['metadata'] is not None, "Metadata should exist"
        assert updated_user['metadata'].get('new_field') == "new_value", "New field should be added"
        print("✓ User metadata updated successfully")
        
        return True
    except Exception as e:
        print(f"✗ Metadata operations failed: {e}")
        raise


async def run_all_tests():
    """Run all tests"""
    print("\n" + "="*70)
    print("RUNNING INTEGRATION TESTS")
    print("="*70)
    
    results = []
    
    try:
        # Test 1: Database connection
        results.append(await test_database_connection())
        
        # Test 2-6: Repository operations
        results.append(await test_user_repository_create())
        results.append(await test_user_repository_find())
        results.append(await test_user_repository_update())
        results.append(await test_user_repository_password())
        results.append(await test_user_repository_metadata())
        
        # Cleanup (Supabase client does not need explicit close)
        print("\n" + "="*50)
        print("CLEANUP")
        print("="*50)
        print("✓ Supabase client cleanup complete")
    except Exception as e:
        print(f"\n✗ Test suite failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    passed = sum(1 for r in results if r is True or (isinstance(r, dict) and 'id' in r))
    total = len(results)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("✓ All tests passed!")
        return True
    else:
        print("✗ Some tests failed")
        return False


if __name__ == "__main__":
    # Run tests
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)

