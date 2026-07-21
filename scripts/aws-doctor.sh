#!/usr/bin/env bash
# Check AWS connectivity, DynamoDB tables, and IAM policy state for Carriera.
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)}"
FUNDS_TABLE="${FUNDS_TABLE:-carriera-funds}"
CHALLENGES_TABLE="${CHALLENGES_TABLE:-carriera-challenges}"
ENTITLEMENTS_TABLE="${ENTITLEMENTS_TABLE:-carriera-entitlements}"
MANDATES_TABLE="${MANDATES_TABLE:-carriera-mandates}"
MANAGERS_TABLE="${MANAGERS_TABLE:-carriera-managers}"
TASK_ROLE="${TASK_ROLE:-ecsTaskExecutionRole}"
GITHUB_ROLE="${GITHUB_ROLE:-github-actions-ecs-role}"
POLICY_NAME="CarrieraFundsDynamoDBPolicy"
POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${POLICY_NAME}"
GITHUB_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/GitHubActionsECSExpressPolicy"

fail=0

check() {
  local label="$1"
  shift
  if "$@"; then
    echo "  OK   $label"
  else
    echo "  FAIL $label"
    fail=1
  fi
}

echo "Carriera AWS doctor"
echo "  region:  $AWS_REGION"
echo "  account: ${AWS_ACCOUNT_ID:-unknown}"
echo ""

echo "Credentials"
if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  echo "  FAIL not logged in — run: ./scripts/aws-login.sh"
  echo "      or open AWS Console → CloudShell and run ./scripts/aws-ecs-express-setup.sh there"
  exit 1
fi
aws sts get-caller-identity --output table
echo ""

echo "DynamoDB tables"
for table in "$FUNDS_TABLE" "$CHALLENGES_TABLE" "$ENTITLEMENTS_TABLE" "$MANDATES_TABLE" "$MANAGERS_TABLE"; do
  if aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "  OK   $table exists"
  else
    echo "  FAIL $table exists"
    fail=1
  fi
done
echo ""

echo "ECS task role ($TASK_ROLE)"
if aws iam get-role --role-name "$TASK_ROLE" >/dev/null 2>&1; then
  echo "  OK   role exists"
else
  echo "  FAIL role exists"
  fail=1
fi
if aws iam list-attached-role-policies --role-name "$TASK_ROLE" --query 'AttachedPolicies[].PolicyName' --output text 2>/dev/null | grep -q "$POLICY_NAME"; then
  echo "  OK   $POLICY_NAME attached"
else
  echo "  FAIL $POLICY_NAME not attached to $TASK_ROLE"
  fail=1
fi
echo ""

echo "DynamoDB IAM policy ($POLICY_NAME)"
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  VERSION="$(aws iam get-policy --policy-arn "$POLICY_ARN" --query 'Policy.DefaultVersionId' --output text)"
  DOC="$(aws iam get-policy-version --policy-arn "$POLICY_ARN" --version-id "$VERSION" --query 'PolicyVersion.Document' --output json)"
  for table in "$FUNDS_TABLE" "$CHALLENGES_TABLE" "$ENTITLEMENTS_TABLE" "$MANDATES_TABLE" "$MANAGERS_TABLE"; do
    if grep -q "$table" <<<"$DOC"; then
      echo "  OK   allows $table"
    else
      echo "  FAIL missing $table in policy"
      fail=1
    fi
  done
else
  echo "  FAIL policy does not exist"
  fail=1
fi
echo ""

echo "GitHub Actions role ($GITHUB_ROLE)"
if aws iam get-role --role-name "$GITHUB_ROLE" >/dev/null 2>&1; then
  GITHUB_DOC="$(aws iam get-policy-version \
    --policy-arn "$GITHUB_POLICY_ARN" \
    --version-id "$(aws iam get-policy --policy-arn "$GITHUB_POLICY_ARN" --query 'Policy.DefaultVersionId' --output text 2>/dev/null || echo v1)" \
    --query 'PolicyVersion.Document' --output json 2>/dev/null || echo '{}')"
  if grep -q 'iam:CreatePolicyVersion' <<<"$GITHUB_DOC"; then
    echo "  OK   can sync IAM on deploy"
  else
    echo "  FAIL missing IAM sync permissions — re-run ./scripts/aws-ecs-express-setup.sh"
    fail=1
  fi
else
  echo "  WARN $GITHUB_ROLE not found (setup not run yet?)"
fi
echo ""

if [[ "$fail" -eq 0 ]]; then
  echo "All checks passed."
else
  echo "Fix: ./scripts/aws-ecs-express-setup.sh"
  echo "     (or AWS Console → CloudShell in eu-west-1, clone repo, run same script)"
  exit 1
fi
