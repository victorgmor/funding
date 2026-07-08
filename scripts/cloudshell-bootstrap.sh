#!/usr/bin/env bash
# Self-contained AWS bootstrap for CloudShell — no git clone required.
# Paste into AWS CloudShell (eu-west-1) or run locally after aws login.
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
FUNDS_TABLE="${FUNDS_TABLE:-carriera-funds}"
CHALLENGES_TABLE="${CHALLENGES_TABLE:-carriera-challenges}"
ENTITLEMENTS_TABLE="${ENTITLEMENTS_TABLE:-carriera-entitlements}"
TASK_ROLE="${TASK_ROLE:-ecsTaskExecutionRole}"
GITHUB_ROLE="${GITHUB_ROLE:-github-actions-ecs-role}"
DDB_POLICY_NAME="CarrieraFundsDynamoDBPolicy"
GITHUB_POLICY_NAME="GitHubActionsECSExpressPolicy"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION"

upsert_policy() {
  local name="$1" doc="$2"
  local arn="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${name}"
  if aws iam get-policy --policy-arn "$arn" >/dev/null 2>&1; then
    echo "Updating IAM policy ${name}..."
    aws iam create-policy-version \
      --policy-arn "$arn" \
      --policy-document "file://$doc" \
      --set-as-default
  else
    echo "Creating IAM policy ${name}..."
    aws iam create-policy --policy-name "$name" --policy-document "file://$doc"
  fi
}

attach_policy() {
  local role="$1" name="$2"
  aws iam attach-role-policy \
    --role-name "$role" \
    --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${name}" 2>/dev/null || true
}

# DynamoDB tables
if ! aws dynamodb describe-table --table-name "$CHALLENGES_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Creating ${CHALLENGES_TABLE}..."
  aws dynamodb create-table \
    --table-name "$CHALLENGES_TABLE" \
    --region "$AWS_REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=nonce,AttributeType=S \
    --key-schema AttributeName=nonce,KeyType=HASH
  aws dynamodb wait table-exists --table-name "$CHALLENGES_TABLE" --region "$AWS_REGION"
  aws dynamodb update-time-to-live \
    --table-name "$CHALLENGES_TABLE" \
    --region "$AWS_REGION" \
    --time-to-live-specification "Enabled=true,AttributeName=ttl"
else
  echo "Table ${CHALLENGES_TABLE} already exists."
fi

if ! aws dynamodb describe-table --table-name "$ENTITLEMENTS_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Creating ${ENTITLEMENTS_TABLE}..."
  aws dynamodb create-table \
    --table-name "$ENTITLEMENTS_TABLE" \
    --region "$AWS_REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH
  aws dynamodb wait table-exists --table-name "$ENTITLEMENTS_TABLE" --region "$AWS_REGION"
else
  echo "Table ${ENTITLEMENTS_TABLE} already exists."
fi

# ECS task role DynamoDB access
cat >"$TMP_DIR/dynamodb-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
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
  }]
}
EOF

upsert_policy "$DDB_POLICY_NAME" "$TMP_DIR/dynamodb-policy.json"
attach_policy "$TASK_ROLE" "$DDB_POLICY_NAME"

# GitHub Actions deploy role — allow IAM sync on deploy
cat >"$TMP_DIR/github-ecs-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:CreateCluster",
        "ecs:RegisterTaskDefinition",
        "ecs:CreateExpressGatewayService",
        "ecs:UpdateExpressGatewayService",
        "ecs:DescribeExpressGatewayService",
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:ListServiceDeployments",
        "ecs:UpdateService",
        "ecs:DescribeServiceDeployments"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsInfrastructureRoleForExpressServices"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:GetPolicy",
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:ListPolicyVersions",
        "iam:DeletePolicyVersion",
        "iam:AttachRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${DDB_POLICY_NAME}",
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${TASK_ROLE}"
      ]
    }
  ]
}
EOF

if aws iam get-role --role-name "$GITHUB_ROLE" >/dev/null 2>&1; then
  upsert_policy "$GITHUB_POLICY_NAME" "$TMP_DIR/github-ecs-policy.json"
  attach_policy "$GITHUB_ROLE" "$GITHUB_POLICY_NAME"
else
  echo "WARN: role ${GITHUB_ROLE} not found — skip GitHub IAM sync update."
fi

echo ""
echo "Done. ECS task role ${TASK_ROLE} can now write to:"
echo "  - ${FUNDS_TABLE}"
echo "  - ${CHALLENGES_TABLE}"
echo "  - ${ENTITLEMENTS_TABLE}"
echo ""
echo "Retry bundle create in the app — no redeploy needed."
