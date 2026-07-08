#!/usr/bin/env bash
# Refresh AWS CLI credentials and verify account access.
set -euo pipefail

echo "Logging in to AWS..."
aws login

echo ""
echo "Verifying credentials..."
aws sts get-caller-identity

echo ""
echo "OK — run ./scripts/aws-doctor.sh or ./scripts/aws-ecs-express-setup.sh next."
