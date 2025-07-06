This file will monitor the status of Brainstorm, log the findings, and may trigger actions based on the status.

systemd services to monitor:
- whether processAllTasks is running
- whether reconciliation is running

log files to monitor:
- /var/log/brainstorm/processAllTasks.log
- /var/log/brainstorm/reconciliation.log

If log files indicate that reconciliation has stalled, start it.

If log files indicate that processAllTasks has stalled, restart it.
