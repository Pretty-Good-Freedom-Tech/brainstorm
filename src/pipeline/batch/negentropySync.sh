#!/bin/bash

# adapted from https://github.com/hoytech/strfry/blob/master/README.md#sync

# TODO: enable ability to pass relay as vaariable, with wss://relay.primal.net as default

# TODO: setup service to set up cron job (infrequently - maybe once a day)

# TODO: only restart service if it was on before calling this script

sudo systemctl stop addToQueue.service

sudo strfry sync wss://relay.primal.net --filter '{"kinds":[3,1984,10000]}'

sudo systemctl start addToQueue.service