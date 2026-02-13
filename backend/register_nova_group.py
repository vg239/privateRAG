"""
One-time script to register your Nova group.
Run this once before uploading documents.

Usage:
    python register_nova_group.py
"""

import asyncio
from nova_storage import nova_register_group
from config import settings


async def main():
    group_id = settings.NOVA_GROUP_ID
    print(f"Registering group '{group_id}' on Nova...")
    try:
        result = await nova_register_group(group_id)
        print(f"✅ {result}")
    except Exception as e:
        print(f"❌ Failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
