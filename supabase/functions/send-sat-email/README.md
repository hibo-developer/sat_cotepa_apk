# Edge Function: send-sat-email

Envia automaticamente el informe PDF del parte a sat@cotepa.com usando Resend.

## Secrets requeridos

Configura en Supabase:

- RESEND_API_KEY
- SAT_FROM_EMAIL (debe ser un remitente verificado en Resend, por ejemplo: SAT <sat@tu-dominio.com>)
- SAT_TO_EMAIL (opcional, por defecto sat@cotepa.com)
- MAIL_FUNCTION_TOKEN (opcional, recomendado)

## Deploy

```bash
supabase functions deploy send-sat-email --no-verify-jwt
```

## URL esperada para frontend

`VITE_SAT_MAIL_ENDPOINT=https://<PROJECT_REF>.functions.supabase.co/send-sat-email`

Si usas `MAIL_FUNCTION_TOKEN`, define tambien en frontend:

`VITE_SAT_MAIL_TOKEN=<mismo_token>`
