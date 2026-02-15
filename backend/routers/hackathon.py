import subprocess
import logging
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/hackathon",
    tags=["hackathon"]
)

class NovaUploadResponse(BaseModel):
    cid: str
    transactionHash: str
    blockscanUrl: str

@router.post("/upload-nova", response_model=NovaUploadResponse)
async def upload_nova_cli():
    """
    Executes the 'near contract call-function' CLI command to simulate/record 
    a transaction for the hackathon demo.
    """
    try:
        # The command provided by the user
        # Note: We need to ensure we run this from the project root or where 'near' is accessible
        # For this environment, we'll try running it directly.
        command = [
            "/Users/nikhilkottoli/.cargo/bin/near", "contract", "call-function", "as-transaction", 
            "nova-sdk-6.testnet", "record_transaction", "json-args",
            '{"group_id": "nikhil-rag-vault", "user_id": "nikhilkottoli.testnet", "file_hash": "8f6189f97d190af5fd3032327644959295858a99232ccfee0d6c10f84daa002d", "ipfs_hash": "bafkreiepmge7s7izbl272mbsgj3ejfmsswcyvgjdfth64dlmcd4e3kqafu"}',
            "prepaid-gas", "30.0 Tgas",
            "attached-deposit", "0.01 NEAR",
            "sign-as", "nikhilkottoli.testnet",
            "network-config", "testnet",
            "sign-with-keychain", "send"
        ]

        logger.info(f"Executing NEAR CLI command: {' '.join(command)}")
        
        # Execute the command
        # cwd set to project root might be needed if .near-credentials are there
        # We also need to capture stderr to see why it fails
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=False
        )

        output = result.stdout
        error_output = result.stderr
        
        logger.info(f"CLI Return Code: {result.returncode}")
        logger.info(f"CLI STDOUT: {output}")
        logger.info(f"CLI STDERR: {error_output}")
        
        if result.returncode != 0:
            logger.error(f"CLI Command Failed: {error_output}")
            # Fails gracefully so frontend can show generic success
            raise HTTPException(status_code=500, detail=f"CLI Execution Failed: {error_output}")

        # Extract Transaction ID
        # Looking for pattern: Transaction ID: <alpha-numeric-string>
        # NOTE: near-cli-rs prints the transaction details (including ID) to STDERR, not STDOUT.
        # STDOUT contains the function return value.
        match = re.search(r"Transaction ID: ([a-zA-Z0-9]+)", error_output)
        
        if match:
            tx_hash = match.group(1)
            logger.info(f"Successfully extracted Transaction ID: {tx_hash}")
        else:
            logger.warning("Could not find 'Transaction ID' in output")
            raise HTTPException(status_code=500, detail="Could not parse Transaction ID")

        # Hardcoded CID matching the hash (since we aren't actually uploading a new file in this mock flow)
        cid = "bafkreiepmge7s7izbl272mbsgj3ejfmsswcyvgjdfth64dlmcd4e3kqafu"
        
        return {
            "cid": cid,
            "transactionHash": tx_hash,
            "blockscanUrl": f"https://testnet.nearblocks.io/tx/{tx_hash}"
        }

    except Exception as e:
        logger.error(f"Error in upload_nova_cli: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
