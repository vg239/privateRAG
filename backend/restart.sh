#!/bin/bash

rm -rf .venv
uv venv
source .venv/bin/source
uv pip install -r requirements.txt
uv run uvicorn main:app --port 8000
