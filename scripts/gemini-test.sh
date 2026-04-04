#!/bin/bash
GEMINI_KEY=$1
if [ -z "$GEMINI_KEY" ]; then
  echo "Usage: $0 <GEMINI_API_KEY>"
  exit 1
fi
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" \
  -H 'Content-Type: application/json' \
  -H "x-goog-api-key: $GEMINI_KEY" \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a less than 10 words"
          }
        ]
      }
    ]
  }'