/**
 * Resend email client
 * Used for: registration notifications, approval/rejection emails
 * Display sender: "IDSS Direktor" <direktor@idss.ba>
 */

import { env } from "@/lib/env";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_NAME = "IDSS Direktor";
const FROM_EMAIL = env.RESEND_FROM_EMAIL;
const DIRECTOR_EMAIL = "mulalic71@gmail.com";

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(options: SendEmailOptions): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Resend email failed: ${JSON.stringify(error)}`);
  }
}

export async function sendNewRegistrationNotification(
  applicantName: string,
  applicantEmail: string,
  roleRequested: string,
): Promise<void> {
  await sendEmail({
    to: DIRECTOR_EMAIL,
    subject: "Nova registracija čeka odobrenje — IDSS Handbook",
    html: `
      <h2>Nova registracija</h2>
      <p><strong>Ime:</strong> ${applicantName}</p>
      <p><strong>Email:</strong> ${applicantEmail}</p>
      <p><strong>Tražena uloga:</strong> ${roleRequested}</p>
      <p>Prijavite se na IDSS Handbook da biste odobrili ili odbili zahtjev.</p>
    `,
  });
}

export async function sendRegistrationApproved(
  to: string,
  fullName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Vaša registracija je odobrena — IDSS Handbook",
    html: `
      <h2>Pozdrav, ${fullName}!</h2>
      <p>Vaš zahtjev za pristup IDSS Handbook-u je odobren.</p>
      <p>Možete se prijaviti na: <a href="https://web-app-idss-handbook.vercel.app/login">IDSS Handbook</a></p>
    `,
  });
}

export async function sendRegistrationRejected(
  to: string,
  fullName: string,
  reason: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Vaša registracija nije odobrena — IDSS Handbook",
    html: `
      <h2>Pozdrav, ${fullName}!</h2>
      <p>Nažalost, Vaš zahtjev za pristup IDSS Handbook-u nije odobren.</p>
      <p><strong>Razlog:</strong> ${reason}</p>
      <p>Za više informacija obratite se direktoru škole.</p>
    `,
  });
}
