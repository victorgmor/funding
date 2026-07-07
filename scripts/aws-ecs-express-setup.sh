#!/usr/bin/env bash
# One-time AWS setup for GitHub → ECS Express Mode deploys.
# Usage: ./scripts/aws-ecs-express-setup.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
GITHUB_USER="${GITHUB_USER:-victorgmor}"
GITHUB_REPO="${GITHUB_REPO:-carriera}"
ECR_REPOSITORY="${ECR_REPOSITORY:-carriera}"
ROLE_NAME="github-actions-ecs-role"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION  Repo: $GITHUB_USER/$GITHUB_REPO"

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
    echo "Policy $policy exists."
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

echo ""
echo "Done. Set GitHub Actions variables on ${GITHUB_USER}/${GITHUB_REPO}:"
echo "  AWS_REGION=$AWS_REGION"
echo "  AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "  ECR_REPOSITORY=$ECR_REPOSITORY"
echo "  ECS_SERVICE=carriera"
echo "  ECS_CLUSTER=default"
echo ""
echo "Then push to main — GitHub Actions will build and deploy."
