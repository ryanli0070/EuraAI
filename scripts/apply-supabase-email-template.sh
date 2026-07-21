#!/usr/bin/env bash
#
# Apply Eura's OTP-code email templates to the HOSTED Supabase project via the
# Management API:
#   - "Confirm signup"       (supabase/templates/confirmation.html)
#   - "Confirm email change" (supabase/templates/email_change.html)
#   - "Reset password"       (supabase/templates/recovery.html)
# All show {{ .Token }} so users type the 8-digit code into the app instead of
# tapping a link. The email-change one is what a guest receives when upgrading
# to a full account.
#
# Only touches these templates + subjects — it does NOT push the rest of
# supabase/config.toml (which has drifted to local-dev values), so it can't
# clobber production auth settings.
#
# Usage (token stays local, never in the repo):
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/apply-supabase-email-template.sh
#
# Get a personal access token: https://supabase.com/dashboard/account/tokens
set -euo pipefail

PROJECT_REF="lfctnhvnpxrocafiwkdb"
TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/templates"

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN — get one at https://supabase.com/dashboard/account/tokens}"

confirmation="$(cat "$TEMPLATE_DIR/confirmation.html")"
email_change="$(cat "$TEMPLATE_DIR/email_change.html")"
recovery="$(cat "$TEMPLATE_DIR/recovery.html")"

jq -n \
  --arg confirmation "$confirmation" \
  --arg email_change "$email_change" \
  --arg recovery "$recovery" \
  '{
    mailer_templates_confirmation_content: $confirmation,
    mailer_subjects_confirmation: "Your Eura confirmation code",
    mailer_templates_email_change_content: $email_change,
    mailer_subjects_email_change: "Your Eura confirmation code",
    mailer_templates_recovery_content: $recovery,
    mailer_subjects_recovery: "Your Eura password reset code"
  }' \
| curl -fsS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data @- >/dev/null

echo "✓ Confirmation + email-change + recovery templates applied to project ${PROJECT_REF}"
