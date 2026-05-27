#!/bin/bash
# publish.sh — same script as publish.command, for running from Terminal directly.
# For double-click in Finder, use publish.command instead.
exec "$(dirname "$0")/publish.command"
