#!/usr/bin/env bash
# Configura secretos desde tu terminal. Nunca imprimir contraseñas ni direcciones en logs de Actions.
set -euo pipefail
cd "$(dirname "$0")/.."
provider=${1:-}
if [[ ! "$provider" =~ ^(gmail|smtp|resend)$ ]]; then
  echo 'Uso: bash scripts/configure-email.sh gmail|smtp|resend' >&2
  exit 1
fi
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
if [ -f .email-recipients ]; then
  gh secret set ALERT_EMAIL_TO --repo "$repo" < .email-recipients
else
  read -r -p 'Destinatarios separados por coma: ' recipients
  printf '%s' "$recipients" | gh secret set ALERT_EMAIL_TO --repo "$repo"
fi
read -r -p 'Dirección remitente autorizada por el servicio: ' sender
printf '%s' "$sender" | gh secret set ALERT_EMAIL_FROM --repo "$repo"
if [ "$provider" = resend ]; then
  echo 'Introducí la clave API en el prompt seguro de gh (no en el chat).'
  gh secret set RESEND_API_KEY --repo "$repo"
  gh variable set EMAIL_TRANSPORT --repo "$repo" --body resend
else
  if [ "$provider" = gmail ]; then
    host=smtp.gmail.com
    port=465
    smtp_user=$sender
    echo 'Usar una contraseña de aplicación de Google, no la contraseña normal de la cuenta.'
  else
    read -r -p 'Servidor SMTP: ' host
    read -r -p 'Puerto SMTP (465 TLS o 587 STARTTLS): ' port
    read -r -p 'Usuario SMTP: ' smtp_user
  fi
  printf '%s' "$host" | gh secret set SMTP_HOST --repo "$repo"
  printf '%s' "$port" | gh secret set SMTP_PORT --repo "$repo"
  printf '%s' "$smtp_user" | gh secret set SMTP_USER --repo "$repo"
  echo 'Introducí la contraseña SMTP o de aplicación en el prompt seguro de gh.'
  gh secret set SMTP_PASSWORD --repo "$repo"
  gh variable set EMAIL_TRANSPORT --repo "$repo" --body smtp
fi
echo 'Secretos configurados. Verificá que el código de correo esté publicado en main y ejecutá el workflow de monitoreo.'
