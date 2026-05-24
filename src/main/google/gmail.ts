import nodemailer from 'nodemailer'
import { getDatabase } from '../db'

function getSetting(key: string): string | null {
  try {
    const row = getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch { return null }
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const appPassword = getSetting('gmail_app_password')
  if (!appPassword) {
    return { ok: false, error: 'Gmail app password not configured. Add it in Settings → Integrations.' }
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'kantorconsulting.hub@gmail.com', pass: appPassword },
    })
    await transporter.sendMail({
      from: '"Kantor Consulting Hub" <kantorconsulting.hub@gmail.com>',
      to,
      subject,
      html,
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export function inviteEmailHtml(opts: {
  name: string; email: string; tempPassword: string; appVersion: string
}): string {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f1624;color:#fff;border-radius:12px">
    <div style="margin-bottom:24px">
      <h2 style="margin:0 0 4px;color:#fff;font-size:18px">Welcome to Kantor Consulting Hub</h2>
      <p style="margin:0;color:rgba(255,255,255,0.4);font-size:14px">You've been invited to join the team</p>
    </div>
    <p style="color:rgba(255,255,255,0.7);font-size:14px">Hi ${opts.name},</p>
    <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6">You've been given access to the Kantor Consulting Hub workspace.</p>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6)"><strong style="color:#fff">Email:</strong> ${opts.email}</p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6)"><strong style="color:#fff">Temporary password:</strong>
        <code style="background:rgba(217,119,6,0.15);color:#d97706;padding:2px 8px;border-radius:5px">${opts.tempPassword}</code>
      </p>
    </div>
    <p style="color:rgba(255,255,255,0.4);font-size:13px">You will be asked to set a new password on first login.</p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0">
    <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0">Kantor Consulting Hub v${opts.appVersion}</p>
  </div>`
}
