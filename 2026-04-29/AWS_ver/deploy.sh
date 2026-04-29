#!/usr/bin/env bash
# ------------------------------------------------------------------
# AI Debate Arena — SAM 배포 스크립트 (x02 계정)
#
# 수행:
#   1) ~/.kiro/secrets/.env 에서 AWS 자격증명 + API 키 로드
#   2) sam build
#   3) sam deploy (HttpApi + Lambda + S3 + CloudFront)
#   4) S3 에 정적 파일 업로드
#   5) CloudFront 무효화
#   6) 접속 URL 출력
#
# 사용:
#   ./deploy.sh
# ------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STACK_NAME="ai-debate-arena"
REGION="ap-northeast-2"

# --- 1. 자격증명 로드 (.env 의 AWS_X02_* 를 표준 AWS_* 로 매핑) ---
ENV_FILE="$HOME/.kiro/secrets/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# 필요한 변수만 골라서 tmpfile 에 쓴 뒤 source (주석/공백 제거)
TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT
grep -E '^(AWS_X02_|AZURE_OPENAI_|GEMINI_)' "$ENV_FILE" > "$TMP_ENV"
set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a

# 표준 AWS_* 로 리네임
export AWS_ACCESS_KEY_ID="${AWS_X02_ACCESS_KEY_ID:?missing in .env}"
export AWS_SECRET_ACCESS_KEY="${AWS_X02_SECRET_ACCESS_KEY:?missing in .env}"
export AWS_DEFAULT_REGION="${AWS_X02_REGION:-$REGION}"
unset AWS_PROFILE || true

# API 키
: "${AZURE_OPENAI_ENDPOINT:?missing in .env}"
: "${AZURE_OPENAI_API_KEY:?missing in .env}"
AZURE_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT_GPT54:-${AZURE_OPENAI_DEPLOYMENT_GPT52:-gpt-4o}}"
: "${GEMINI_API_KEY_GENAI:?missing in .env}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-flash-preview}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Account: $(aws sts get-caller-identity --query Account --output text)"
echo "📍 Region:  $AWS_DEFAULT_REGION"
echo "📍 Stack:   $STACK_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- 2. SAM build ---
echo ""
echo "▶ sam build"
sam build

# --- 3. SAM deploy ---
echo ""
echo "▶ sam deploy"
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$AWS_DEFAULT_REGION" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --parameter-overrides \
    "AzureOpenAIEndpoint=$AZURE_OPENAI_ENDPOINT" \
    "AzureOpenAIApiKey=$AZURE_OPENAI_API_KEY" \
    "AzureOpenAIDeployment=$AZURE_DEPLOYMENT" \
    "GeminiApiKey=$GEMINI_API_KEY_GENAI" \
    "GeminiModel=$GEMINI_MODEL"

# --- 4. Outputs 추출 ---
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_DEFAULT_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='StaticBucketName'].OutputValue" \
  --output text)
CF_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_DEFAULT_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)
CF_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_DEFAULT_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" \
  --output text)

echo ""
echo "▶ Static bucket: $BUCKET"
echo "▶ CloudFront: $CF_DOMAIN (id=$CF_ID)"

# --- 5. 정적 파일 업로드 ---
echo ""
echo "▶ aws s3 sync → $BUCKET"
aws s3 sync . "s3://$BUCKET" \
  --delete \
  --exclude ".*" \
  --exclude "*/.*" \
  --exclude "lambda/*" \
  --exclude "template.yaml" \
  --exclude "samconfig.toml" \
  --exclude "deploy.sh" \
  --exclude "README*.md" \
  --exclude ".aws-sam/*" \
  --exclude "__pycache__/*"

# --- 6. CloudFront 무효화 ---
echo ""
echo "▶ CloudFront invalidation /*"
INV_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)
echo "  invalidation id: $INV_ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 배포 완료"
echo ""
echo "🌐 https://$CF_DOMAIN"
echo ""
echo "  (CloudFront 최초 배포 전파에 5~15분 소요. 그 전엔 504/403 이 날 수 있음.)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
