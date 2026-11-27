// Documents: the trip sheet (print HTML) built with email/document-style-kit from the Org settings. No names, numbers or colours here.
// Real text, real tables, tagged semantic HTML; the browser prints it to PDF. See docs/DOCUMENT-INVENTORY.md.
import { readFileSync } from 'node:fs';
import { buildJobCard } from '../lib/document-style-kit/builders/ops.ts';
import { renderHtml } from '../lib/document-style-kit/html.ts';
import { LABELS } from './workflow.mjs';

const LOGO = new URL('../public/icon-192.png', import.meta.url);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }) : '');

/** ride: a trip as the API returns it; events: its history; org: from loadOrg. Returns an HTML string. */
export function tripSheetHtml(ride, events, org, now = new Date()) {
  const resolved = { ...org, logoData: { primary: new Uint8Array(readFileSync(LOGO)) }, signatureData: {} };
  const isParts = ride.kind === 'parts';
  const done = ['completed', 'cancelled', 'rejected'].includes(ride.status);
  const spec = buildJobCard({
    meta: { docNo: `TRH-TRP-${now.getUTCFullYear()}-${String(ride.id).replace(/\D/g, '').padStart(6, '0').slice(-6)}`, title: isParts ? 'Parts transport sheet' : 'Trip sheet', date: now.toISOString().slice(0, 10), author: 'Transport Hub', generatedAt: now.toISOString(), status: done ? 'ISSUED' : 'DRAFT', personalInfo: true },
    title: isParts ? 'Parts transport sheet' : 'Trip sheet', site: ride.pickup_address, technician: ride.driver_name ?? 'Not yet assigned', customer: ride.requester, jobType: isParts ? 'Parts' : 'Passengers', priority: LABELS[ride.status] ?? ride.status,
    facts: [['Destination', ride.destination_address], ['Vehicle type', ride.vehicle_type ?? ''], ['Passengers', isParts ? '' : String(ride.passenger_count ?? '')], ['Cost centre', ride.cost_centre ?? ''], ['Distance', ride.distance_text ?? ''], ['Planned', when(ride.scheduled_at)]],
    items: [], showPrices: false, banner: done ? undefined : 'Trip not finished: this sheet shows the position when it was printed.',
    work: [ride.purpose ? `Purpose: ${ride.purpose}` : null, isParts && ride.items ? `Items: ${String(ride.items).split('\n').filter(Boolean).join('; ')}` : null].filter(Boolean),
    sections: [{ heading: 'History', table: { columns: ['When', 'Step', 'By'], rows: events.map((e) => [when(e.at), e.type, e.actor ?? '']) }, empty: 'No steps recorded yet.' }],
    signatures: [{ name: ride.requester ?? 'Requester', capacity: 'Requester' }, { name: ride.driver_name ?? 'Driver', capacity: 'Driver' }], signaturesSide: true, customerSignoff: false,
  }, resolved);
  return renderHtml(spec, resolved, { fonts: 'none', allowMissingContact: true });
}
