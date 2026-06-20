#!/usr/bin/env bash
#
# Apply Eura's "Confirm signup" email template (the 6-digit OTP code email) to
# the HOSTED Supabase project via the Management API. This is the one Supabase-
# side change the OTP signup flow needs — it makes the confirmation email show
# {{ .Token }} so users can type the code into the app instead of tapping a link.
#
# Only touches the confirmation template + subject — it does NOT push the rest
# of supabase/config.toml (which has drifted to local-dev values), so it can't
# clobber production auth settings.
#
# Usage (token stays local, never in the repo):
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/apply-supabase-email-template.sh
#
# Get a personal access token: https://supabase.com/dashboard/account/tokens
set -euo pipefail

PROJECT_REF="lfctnhvnpxrocafiwkdb"
TEMPLATE_FILE="$(cd "$(dirname "$0")/.." && pwd)/supabase/templates/confirmation.html"

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN — get one at https://supabase.com/dashboard/account/tokens}"

content="$(cat "$TEMPLATE_FILE")"

jq -n \
  --arg content "$content" \
  --arg subject "Your Eura confirmation code" \
  '{mailer_templates_confirmation_content: $content, mailer_subjects_confirmation: $subject}' \
| curl -fsS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data @- >/dev/null

echo "✓ Confirmation email template applied to project ${PROJECT_REF}"
