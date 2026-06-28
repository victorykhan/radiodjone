#!/bin/bash
# Wait for Liquidsoap telnet port 1234 to be ready before starting Node
echo "Waiting for Liquidsoap telnet (port 1234)..."
for i in $(seq 1 30); do
  if nc -z 127.0.0.1 1234 2>/dev/null; then
    echo "Liquidsoap ready after ${i}s. Starting RadioPlay..."
    break
  fi
  sleep 1
done
exec node /var/www/radiodj/src/app.js
