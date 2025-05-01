#!/bin/bash

# This file is called by systemd service processQueue.service
# It activates processWotQueue.sh and processContentQueue.sh

# Start processWotQueue.sh
sudo /usr/local/lib/node_modules/brainstorm/src/pipeline/stream/wot/processWotQueue.sh &

# Start processContentQueue.sh
# sudo /usr/local/lib/node_modules/brainstorm/src/pipeline/stream/content/processContentQueue.sh &

# Wait for both processes to finish
wait

exit 0
