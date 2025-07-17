#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

echo "$(date): Starting processFollowsMutesReports"
echo "$(date): Starting processFollowsMutesReports" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowerCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowingCounts.sh

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateMuterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateMutingCounts.sh

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateReporterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateReportingCounts.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, following, muter, muting, reporter, and reporting counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, following, muter, muting, reporter, and reporting counts" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedFollowerCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedMuterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedReporterCounts.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowerMuterReporterInputs.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

echo "$(date): Finished processFollowsMutesReports"
echo "$(date): Finished processFollowsMutesReports" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log
