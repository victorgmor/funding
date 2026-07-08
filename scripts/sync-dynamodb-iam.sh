#!/usr/bin/env bash
# Sync CarrieraFundsDynamoDBPolicy on ecsTaskExecutionRole (idempotent).
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
FUNDS_TABLE="${FUNDS_TABLE:-carriera-funds}"
CHALLENGES_TABLE="${CHALLENGES_TABLE:-carriera-challenges}"
ENTITLEMENTS_TABLE="${ENTITLEMENTS_TABLE:-carriera-entitlements}"
TASK_ROLE="${TASK_ROLE:-ecsTaskExecutionRole}"
POLICY_NAME="CarrieraFundsDynamoDBPolicy"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/dynamodb-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${FUNDS_TABLE}",
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${FUNDS_TABLE}/index/*",
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${CHALLENGES_TABLE}",
        "arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${ENTITLEMENTS_TABLE}"
      ]
    }
  ]
}
EOF

POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${POLICY_NAME}"
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  echo "Updating ${POLICY_NAME}..."
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "file://$TMP_DIR/dynamodb-policy.json" \
    --set-as-default
  OLD_VERSIONS="$(aws iam list-policy-versions \
    --policy-arn "$POLICY_ARN" \
    --query 'Versions[?IsDefaultVersion==`false`].VersionId' \
    --output text)"
  if [[ "$(wc -w <<<"$OLD_VERSIONS" | tr -d ' ')" -ge 4 ]]; then
    aws iam delete-policy-version \
      --policy-arn "$POLICY_ARN" \
      --version-id "$(awk '{print $1}' <<<"$OLD_VERSIONS")"
  fi
else
  echo "Creating ${POLICY_NAME}..."
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "file://$TMP_DIR/dynamodb-policy.json"
fi

aws iam attach-role-policy \
  --role-name "$TASK_ROLE" \
  --policy-arn "$POLICY_ARN" 2>/dev/null || true

echo "DynamoDB IAM policy synced for ${TASK_ROLE}."
