from __future__ import annotations

from html import escape
import json
import logging

import requests
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger("gastrowo.auth_email")


# Brand colours from the app (styles.css): primary-strong, grouped background, labels.
_BLUE = "#1f5bd6"
_BG = "#f2f2f7"
_TEXT = "#000000"
_MUTED = "#3c3c43"
_TERTIARY = "#6c6c70"
_FILL = "#eef3fd"
_FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def _email_layout(*, preheader: str, body: str, footer: str) -> str:
    """One card on a light gray page, like the app. Tables and inline styles only: that is what mail clients keep."""
    icon = f"{settings.frontend_url.rstrip('/')}/brand/platofy/platofy-icon-192.png"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Platofy</title>
</head>
<body style="margin:0;padding:0;background:{_BG};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{_BG};">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_BG};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;">
        <tr>
          <td style="padding:0 4px 20px;font-family:{_FONT};">
            <img src="{icon}" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px;">
            <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;font-weight:700;letter-spacing:-0.4px;color:{_TEXT};">platofy</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:20px;padding:32px 28px;font-family:{_FONT};color:{_TEXT};">
{body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 8px 0;font-family:{_FONT};font-size:12px;line-height:18px;color:{_TERTIARY};text-align:center;">
            {footer}<br>
            Platofy · Scheduling, time clock and payroll for restaurants
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def _button(link: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>'
        f'<td style="background:{_BLUE};border-radius:12px;">'
        f'<a href="{escape(link)}" style="display:inline-block;padding:14px 24px;font-family:{_FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">{escape(label)}</a>'
        f"</td></tr></table>"
    )


def otp_email_html(*, title: str, subtitle: str, code: str, expires_in_minutes: int = 5) -> str:
    body = f"""            <h1 style="margin:0 0 8px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.3px;">{escape(title)}</h1>
            <p style="margin:0 0 24px;font-size:16px;line-height:23px;color:{_MUTED};">{escape(subtitle)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:{_FILL};border-radius:16px;padding:22px 12px;">
                  <span style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:36px;line-height:42px;font-weight:700;letter-spacing:10px;white-space:nowrap;color:{_BLUE};">{escape(code)}</span>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:14px;line-height:20px;color:{_TERTIARY};text-align:center;">The code works for {expires_in_minutes} minutes. Never share it with anyone.</p>"""
    return _email_layout(
        preheader=f"Your Platofy code is {code}",
        body=body,
        footer="Didn't ask for this code? Ignore this email: nobody can sign in without it.",
    )


def invite_email_html(*, business_name: str, join_link: str) -> str:
    """`business_name` and `join_link` arrive already escaped."""
    body = f"""            <h1 style="margin:0 0 8px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.3px;">Join {business_name} on Platofy</h1>
            <p style="margin:0 0 20px;font-size:16px;line-height:23px;color:{_MUTED};">Your team uses Platofy for schedules, shift swaps and the time clock. Open the invite, confirm your email and you're in.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
              <td style="background:{_BLUE};border-radius:12px;"><a href="{join_link}" style="display:inline-block;padding:14px 24px;font-family:{_FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Accept the invite</a></td>
            </tr></table>
            <p style="margin:16px 0 0;font-size:14px;line-height:20px;color:{_TERTIARY};">The link works once and stays active for 48 hours.</p>"""
    return _email_layout(preheader=f"You're invited to join {business_name}", body=body, footer="Not expecting this invite? You can ignore this email.")


def _sender() -> str:
    address = settings.resend_from_email
    return address if "<" in address or not settings.resend_from_name else f"{settings.resend_from_name} <{address}>"


def _message(*, to: str, subject: str, html: str, text: str) -> dict:
    """Both HTML and plain text: HTML-only mail is a common spam signal."""
    message = {"from": _sender(), "to": to, "subject": subject, "html": html, "text": text}
    if settings.resend_reply_to:
        message["reply_to"] = settings.resend_reply_to
    return message


def _require_email_provider_in_production(kind: str) -> None:
    # Without a provider the code/link is only written to logs, which must never happen in production.
    if settings.app_env == "production" and not settings.resend_api_key:
        logger.error("RESEND_API_KEY is not configured; cannot send %s email in production", kind)
        raise HTTPException(status_code=503, detail="Email delivery is not configured")


def send_otp_email(*, email: str, code: str, title: str, subtitle: str, expires_in_minutes: int = 5) -> None:
    html = otp_email_html(title=title, subtitle=subtitle, code=code, expires_in_minutes=expires_in_minutes)
    _require_email_provider_in_production("verification")
    
    logger.info("send_otp_email called for %s, api_key_set=%s", email, bool(settings.resend_api_key))
    
    if settings.resend_api_key:
        try:
            logger.info("Attempting to send OTP email to %s via Resend", email)
            response = requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=_message(
                    to=email,
                    # The code in the subject: people find it without opening the mail, and it reads as expected mail.
                    subject=f"{code} is your Platofy code",
                    html=html,
                    text=f"{title}\n\n{subtitle}\n\nYour code: {code}\nIt expires in {expires_in_minutes} minutes.\n\nIf you didn't ask for it, ignore this email.\n\nPlatofy",
                ),
                timeout=10,
            )
            response.raise_for_status()
            logger.info("OTP email sent to %s", email)
        except Exception as exc:
            provider_body = exc.response.text if isinstance(exc, requests.HTTPError) and exc.response is not None else None
            logger.error("Failed to send OTP email to %s: %s | provider=%s", email, exc, provider_body, exc_info=True)
            raise HTTPException(status_code=502, detail="Failed to send verification email") from exc
    else:
        logger.info("DEV OTP EMAIL -> %s | code=%s | html=%s", email, code, html)


def send_invite_email(*, email: str, business_name: str, join_link: str) -> None:
    html = invite_email_html(business_name=escape(business_name), join_link=escape(join_link))
    _require_email_provider_in_production("invite")
    
    logger.info("send_invite_email called for %s, api_key_set=%s", email, bool(settings.resend_api_key))
    
    if settings.resend_api_key:
        try:
            logger.info("Attempting to send invite email to %s via Resend", email)
            response = requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=_message(
                    to=email,
                    subject=f"You were invited to join {business_name}",
                    html=html,
                    text=f"You were invited to join {business_name} on Platofy.\n\nOpen this link to join:\n{join_link}\n\nPlatofy",
                ),
                timeout=10,
            )
            response.raise_for_status()
            logger.info("Invite email sent to %s | business=%s", email, business_name)
        except Exception as exc:
            provider_body = exc.response.text if isinstance(exc, requests.HTTPError) and exc.response is not None else None
            logger.error("Failed to send invite email to %s: %s | provider=%s", email, exc, provider_body, exc_info=True)
            raise HTTPException(status_code=502, detail="Failed to send invite email") from exc
    else:
        logger.info("DEV INVITE EMAIL -> %s | join_link=%s | html=%s", email, join_link, html)


def send_notice_email(*, email: str, subject: str, text: str, html: str) -> None:
    """A best-effort notice (support replies and the like): logged, never raised."""
    if not settings.resend_api_key:
        logger.info("DEV NOTICE EMAIL -> %s | %s | %s", email, subject, text)
        return
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"},
            json=_message(to=email, subject=subject, html=html, text=text),
            timeout=10,
        )
        response.raise_for_status()
    except Exception as exc:
        provider_body = exc.response.text if isinstance(exc, requests.HTTPError) and exc.response is not None else None
        logger.error("Failed to send notice email to %s: %s | provider=%s", email, exc, provider_body)


def support_email_html(*, heading: str, preview: str, link: str, button: str) -> str:
    body = f"""            <h1 style="margin:0 0 12px;font-size:21px;line-height:27px;font-weight:700;letter-spacing:-0.2px;">{escape(heading)}</h1>
            <div style="margin:0 0 22px;padding:14px 16px;background:{_BG};border-radius:16px;font-size:15px;line-height:21px;color:{_TEXT};white-space:pre-line;">{escape(preview)}</div>
            {_button(link, button)}"""
    return _email_layout(preheader=preview[:120], body=body, footer="You get this email because of a support conversation in Platofy.")
