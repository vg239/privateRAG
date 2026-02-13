import os
import subprocess
import json
import hashlib
import asyncio
from cryptography.fernet import Fernet

# 1. ENCRYPT MANUALLY
def encrypt_file(file_path):
    key = Fernet.generate_key()
    cipher_suite = Fernet(key)
    with open(file_path, 'rb') as f:
        encrypted_data = cipher_suite.encrypt(f.read())
    return encrypted_data, key.decode()

# 2. ANCHOR TO NOVA CONTRACT
async def anchor_to_nova(file_path, ipfs_cid):
    with open(file_path, 'rb') as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    cmd = [
        "near", "contract", "call-function", "as-transaction",
        "nova-sdk-6.testnet", "record_transaction",
        "json-args", json.dumps({
            "group_id": "nikhil-rag-vault",
            "user_id": "nikhilkottoli.testnet",
            "file_hash": file_hash,
            "ipfs_hash": ipfs_cid
        }),
        "prepaid-gas", "30 TeraGas",
        "attached-deposit", "0.01 NEAR",
        "sign-as", "nikhilkottoli.testnet",
        "network-config", "testnet",
        "sign-with-keychain", "send"
    ]

    print(f"📡 Sending anchor for {file_path} to NEAR...")
    
    # We capture it, but we'll print it manually right after
    result = subprocess.run(cmd, capture_output=True, text=True)

    # Print the output manually so you can still see it in the CLI
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode == 0:
        print("✅ SUCCESS: Transaction recorded on-chain.")
        link = extract_explorer_link(result.stdout)
        print(f"🔗 Explorer Link: {link}")
        return link
    else:
        print("❌ FAIL: Transaction failed.")
        return None

def extract_explorer_link(output):
    if not output:
        return "No output captured"
    for line in output.split('\n'):
        if "https://explorer" in line:
            return line.strip()
    return "Link not found"

if __name__ == "__main__":
    test_file = "test.pdf"
    test_cid = "bafybeicn6..." 
    
    if not os.path.exists(test_file):
        with open(test_file, "w") as f:
            f.write("PRAGma Sovereign Data")

    asyncio.run(anchor_to_nova(test_file, test_cid))