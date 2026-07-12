#!/usr/bin/env bash
# One-time AWS setup for GitHub → ECS Express Mode deploys.
# Usage: ./scripts/aws-ecs-express-setup.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
GITHUB_USER="${GITHUB_USER:-victorgmor}"
GITHUB_REPO="${GITHUB_REPO:-carriera}"
ECR_REPOSITORY="${ECR_REPOSITORY:-carriera}"
FUNDS_TABLE="${FUNDS_TABLE:-carriera-funds}"
CHALLENGES_TABLE="${CHALLENGES_TABLE:-carriera-challenges}"
ENTITLEMENTS_TABLE="${ENTITLEMENTS_TABLE:-carriera-entitlements}"
MANDATES_TABLE="${MANDATES_TABLE:-carriera-mandates}"
ROLE_NAME="github-actions-ecs-role"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION  Repo: $GITHUB_USER/$GITHUB_REPO"

# ECS service-linked role (required once per account)
if ! aws iam get-role --role-name AWSServiceRoleForECS >/dev/null 2>&1; then
  echo "Creating ECS service-linked role..."
  aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com
else
  echo "ECS service-linked role already exists."
fi

# OIDC provider (ignore if exists)
if ! aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" \
  >/dev/null 2>&1; then
  echo "Creating GitHub OIDC provider..."
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faad112258da726fe833b6964
else
  echo "GitHub OIDC provider already exists."
fi

cat >"$TMP_DIR/trust-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_USER}/${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Updating trust policy on ${ROLE_NAME}..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "file://$TMP_DIR/trust-policy.json"
else
  echo "Creating IAM role ${ROLE_NAME}..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TMP_DIR/trust-policy.json"
fi

cat >"$TMP_DIR/ecs-express-policy.json" <<EOF
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
        "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/CarrieraFundsDynamoDBPolicy",
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole"
      ]
    }
  ]
}
EOF

cat >"$TMP_DIR/ecr-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPushPull",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/${ECR_REPOSITORY}"
    },
    {
      "Sid": "AllowLogin",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    }
  ]
}
EOF

for policy in GitHubActionsECSExpressPolicy GitHubActionsECRPolicy; do
  POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${policy}"
  DOC="$TMP_DIR/ecs-express-policy.json"
  [[ "$policy" == "GitHubActionsECRPolicy" ]] && DOC="$TMP_DIR/ecr-policy.json"
  if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
    echo "Updating $policy..."
    aws iam create-policy-version \
      --policy-arn "$POLICY_ARN" \
      --policy-document "file://$DOC" \
      --set-as-default
  else
    aws iam create-policy --policy-name "$policy" --policy-document "file://$DOC"
  fi
  aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "$POLICY_ARN" 2>/dev/null || true
done

# ECS task execution role
if ! aws iam get-role --role-name ecsTaskExecutionRole >/dev/null 2>&1; then
  echo "Creating ecsTaskExecutionRole..."
  aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
else
  echo "ecsTaskExecutionRole already exists."
fi

# ECS Express infrastructure role
if ! aws iam get-role --role-name ecsInfrastructureRoleForExpressServices >/dev/null 2>&1; then
  echo "Creating ecsInfrastructureRoleForExpressServices..."
  aws iam create-role \
    --role-name ecsInfrastructureRoleForExpressServices \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy \
    --role-name ecsInfrastructureRoleForExpressServices \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
else
  echo "ecsInfrastructureRoleForExpressServices already exists."
fi

# ECR repository
if aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "ECR repository $ECR_REPOSITORY already exists."
else
  echo "Creating ECR repository ${ECR_REPOSITORY}..."
  aws ecr create-repository --repository-name "$ECR_REPOSITORY" --region "$AWS_REGION"
fi

# DynamoDB funds table
if aws dynamodb describe-table --table-name "$FUNDS_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "DynamoDB table $FUNDS_TABLE already exists."
else
  echo "Creating DynamoDB table ${FUNDS_TABLE}..."
  aws dynamodb create-table \
    --table-name "$FUNDS_TABLE" \
    --region "$AWS_REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=slug,AttributeType=S \
      AttributeName=managerId,AttributeType=S \
      AttributeName=createdAt,AttributeType=S \
    --key-schema AttributeName=slug,KeyType=HASH \
    --global-secondary-indexes \
      "IndexName=by-manager,KeySchema=[{AttributeName=managerId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}"
  aws dynamodb wait table-exists --table-name "$FUNDS_TABLE" --region "$AWS_REGION"
fi

# DynamoDB auth challenges table
if aws dynamodb describe-table --table-name "$CHALLENGES_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "DynamoDB table $CHALLENGES_TABLE already exists."
else
  echo "Creating DynamoDB table ${CHALLENGES_TABLE}..."
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
fi

# DynamoDB bundle entitlements table
if aws dynamodb describe-table --table-name "$ENTITLEMENTS_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "DynamoDB table $ENTITLEMENTS_TABLE already exists."
else
  echo "Creating DynamoDB table ${ENTITLEMENTS_TABLE}..."
  aws dynamodb create-table \
    --table-name "$ENTITLEMENTS_TABLE" \
    --region "$AWS_REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH
  aws dynamodb wait table-exists --table-name "$ENTITLEMENTS_TABLE" --region "$AWS_REGION"
fi

# DynamoDB mandate ledger table
if aws dynamodb describe-table --table-name "$MANDATES_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "DynamoDB table $MANDATES_TABLE already exists."
else
  echo "Creating DynamoDB table ${MANDATES_TABLE}..."
  aws dynamodb create-table \
    --table-name "$MANDATES_TABLE" \
    --region "$AWS_REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=fundSlug,AttributeType=S \
      AttributeName=sk,AttributeType=S \
    --key-schema \
      AttributeName=fundSlug,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE
  aws dynamodb wait table-exists --table-name "$MANDATES_TABLE" --region "$AWS_REGION"
fi

"$SCRIPT_DIR/sync-dynamodb-iam.sh"

echo ""
echo "Done. Set GitHub Actions variables on ${GITHUB_USER}/${GITHUB_REPO}:"
echo "  AWS_REGION=$AWS_REGION"
echo "  AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "  ECR_REPOSITORY=$ECR_REPOSITORY"
echo "  ECS_SERVICE=carriera"
echo "  ECS_CLUSTER=default"
echo ""
echo "DynamoDB table: $FUNDS_TABLE (FUNDS_TABLE env on ECS task)"
echo "Then push to main — GitHub Actions will build and deploy."
