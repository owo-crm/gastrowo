from __future__ import annotations

import json
import logging

import requests
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger("gastrowo.auth_email")


def otp_email_html(*, title: str, subtitle: str, code: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; color: #1f2937; margin: 0; padding: 0; width: 100% !important; }}
        .email-wrapper {{ width: 100%; background-color: #f9fafb; padding: 40px 0; }}
        .email-content {{ max-width: 480px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
        
        .logo-container {{ text-align: center; margin-bottom: 24px; }}
        .brand-logo {{ display: inline-block; background-color: rgb(4, 120, 87); color: #ffffff; font-size: 14px; font-weight: bold; letter-spacing: 1.5px; padding: 8px 18px; border-radius: 6px; text-transform: uppercase; }}
        
        h1 {{ color: #111827; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px; text-align: center; }}
        p {{ font-size: 15px; line-height: 1.6; color: #4b5563; margin-top: 0; margin-bottom: 20px; }}
        
        .code-container {{ background-color: rgba(4, 120, 87, 0.06); border: 1px solid rgba(4, 120, 87, 0.15); border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; letter-spacing: 4px; }}
        .verification-code {{ font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; color: rgb(4, 120, 87); }}
        
        .expire-text {{ font-size: 13px; color: #9ca3af; text-align: center; margin-top: -10px; margin-bottom: 24px; }}
        .noreply-warning {{ background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; font-size: 13px; color: #991b1b; border-radius: 0 4px 4px 0; margin-bottom: 20px; }}
        .footer {{ font-size: 12px; color: #9ca3af; text-align: center; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 20px; line-height: 1.5; }}
        .footer a {{ color: rgb(4, 120, 87); text-decoration: none; }}
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-content">
            <div class="logo-container">
                <div class="brand-logo">GastrOWO</div>
            </div>
            
            <h1>Confirm your email</h1>
            
            <p>To complete your registration, please use the following one-time verification code (OTP):</p>
            
            <div class="code-container">
                <span class="verification-code">{code}</span>
            </div>
            
            <p class="expire-text">This code is valid for 15 minutes.</p>
            
            <div class="noreply-warning">
                <strong>Please note:</strong> This is an automated message from an unmonitored address. Do not reply to this email.
            </div>

            <p>If you did not request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
            
            <div class="footer">
                <p>Sent by <strong>GastrOWO Inc.</strong><br>
                Stryjska 13, Gdynia</p>
                <p>© 2026 GastrOWO. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>"""


def invite_email_html(*, business_name: str, join_link: str) -> str:
    return f"""
    <html>
      <body style="margin:0;padding:32px;background:#f5f7fb;font-family:Inter,Arial,sans-serif;color:#132238;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5ebf4;border-radius:24px;overflow:hidden;box-shadow:0 16px 48px rgba(15,23,42,0.06);">
          <div style="padding:32px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);">
            <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#eef5ff;color:#2f6fed;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GastrOWO</div>
            <h1 style="margin:20px 0 8px;font-size:28px;line-height:1.1;">You were invited to join {business_name}</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#5d6b80;">Open the link below, request your code, and finish joining the workspace.</p>
          </div>
          <div style="padding:0 32px 32px;">
            <a href="{join_link}" style="display:inline-block;margin-top:8px;padding:14px 22px;border-radius:14px;background:#2f6fed;color:#ffffff;text-decoration:none;font-weight:700;">Open join flow</a>
            <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6d7890;">This invite link stays active for 48 hours and works once.</p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


def send_otp_email(*, email: str, code: str, title: str, subtitle: str) -> None:
    html = otp_email_html(title=title, subtitle=subtitle, code=code)
    
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
                json={
                    "from": settings.resend_from_email,
                    "to": email,
                    "subject": title,
                    "html": html,
                },
            )
            response.raise_for_status()
            logger.info("OTP EMAIL SENT -> %s | code=%s | response=%s", email, code, response.json())
        except Exception as exc:
            logger.error("Failed to send OTP email to %s: %s", email, exc, exc_info=True)
            provider_body = None
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                provider_body = exc.response.text
            raise HTTPException(status_code=502, detail=f"Failed to send verification email{f': {provider_body}' if provider_body else ''}") from exc
    else:
        logger.info("DEV OTP EMAIL -> %s | code=%s | html=%s", email, code, html)


def send_invite_email(*, email: str, business_name: str, join_link: str) -> None:
    html = invite_email_html(business_name=business_name, join_link=join_link)
    
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
                json={
                    "from": settings.resend_from_email,
                    "to": email,
                    "subject": f"You were invited to join {business_name}",
                    "html": html,
                },
            )
            response.raise_for_status()
            logger.info("INVITE EMAIL SENT -> %s | business=%s | response=%s", email, business_name, response.json())
        except Exception as exc:
            logger.error("Failed to send invite email to %s: %s", email, exc, exc_info=True)
            provider_body = None
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                provider_body = exc.response.text
            raise HTTPException(status_code=502, detail=f"Failed to send invite email{f': {provider_body}' if provider_body else ''}") from exc
    else:
        logger.info("DEV INVITE EMAIL -> %s | join_link=%s | html=%s", email, join_link, html)
