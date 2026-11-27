// Org settings for messages and documents (one object, shape of email/document-style-kit Org).
// This repository is public: the defaults are obviously made-up. The real details go in a JSON file named by ORG_FILE (kept on the server, never in git).
import { readFileSync } from 'node:fs';

const DEFAULT_ORG = {
  legalName: 'Transport Hub Operator (Pty) Ltd', tradingName: 'Transport Hub', shortName: 'TransportHub',
  registrationNo: '2000/000000/07', vatNo: '4000000000',
  logo: { primary: 'https://transport.example.invalid/icon-192.png', alt: 'Transport Hub' },
  address: { street: ['1 Sample Street', 'Exampleton', '0001'], country: 'South Africa' },
  contacts: { tel: '010 000 0000', email: 'transport@example.invalid', web: 'https://transport.example.invalid', enquiriesEmail: 'transport@example.invalid' },
  colours: { ink: '#1b2430', primary: '#0b5c8a', accent: '#8a5a00', muted: '#5a6572', rule: '#d5dae0', danger: '#b00020', ok: '#1b7a3d' },
  locale: { language: 'en-ZA', numberStyle: 'space-comma', currency: 'R', tz: 'Africa/Johannesburg' },
  classification: { levels: ['Public', 'Internal', 'Restricted', 'Confidential', 'Secret'], default: 'Internal' },
  numbering: { pattern: '{ORG}-{TYPE}-{YYYY}-{SEQ6}', orgCode: 'TRH' },
  verification: { enabled: false },
  confidentialityText: 'This document is confidential and intended only for the people named in it. Do not copy or share it without permission.',
  personalInfoText: 'This document contains personal information protected by the Protection of Personal Information Act 4 of 2013. Use it only for the trip it was issued for.',
  footerText: 'Transport Hub Operator (Pty) Ltd',
  vatRate: 0.15, allowAbridged: true, signatories: [],
  messaging: { fromName: 'Transport Hub', replyTo: 'transport@example.invalid', logoUrl: 'https://transport.example.invalid/icon-192.png', logoWidth: 48, logoHeight: 48, linkDomains: ['transport.example.invalid'], sms: { senderId: 'TransportHb' } },
};

export function loadOrg(env = process.env) {
  if (!env.ORG_FILE) return DEFAULT_ORG;
  const o = JSON.parse(readFileSync(env.ORG_FILE, 'utf8'));
  return { ...DEFAULT_ORG, ...o, messaging: { ...DEFAULT_ORG.messaging, ...(o.messaging ?? {}) } };
}
