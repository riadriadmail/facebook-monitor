#!/data/data/com.termux/files/usr/bin/bash

echo "Starting Facebook Monitor..."
cd ~/facebook-monitor

termux-wake-lock
termux-notification -t "Facebook Monitor" -c "Running in background"

while true; do
    echo "$(date): Starting monitor..."
    node facebook-monitor.js
    echo "$(date): Process crashed, restarting in 30 seconds..."
    sleep 30
done
