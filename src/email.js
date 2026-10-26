import { createHash } from 'node:crypto';
import { readAlert, setAlertMailState, collectAlerts } from './alerts.js';
export function emailConfiguration(env = process.env) {
  const transport = env.EMAIL_TRANSPORT || 'disabled';
  if (transport === 'disabled') return { enabled: false };
  if (!['smtp', 'resend'].includes(transport)) throw new Error('EMAIL_TRANSPORT debe ser smtp, resend o disabled');
  const validEmail = value => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(value);
  const to = [...new Set((env.ALERT_EMAIL_TO || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))];
  if (!to.length || !to.every(validEmail)) throw new Error('Configurar destinatarios válidos en ALERT_EMAIL_TO');
  const from = (env.ALERT_EMAIL_FROM || '').trim();
  if (!validEmail(from)) throw new Error('Configurar remitente válido en ALERT_EMAIL_FROM');
  if (transport === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('Falta el secreto RESEND_API_KEY');
    return { enabled: true, transport, to, from, apiKey: env.RESEND_API_KEY };
  }
  const port = Number(env.SMTP_PORT || '465');
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Falta configuración SMTP válida: HOST, PORT, USER y PASSWORD');
  return { enabled: true, transport, to, from, smtp: { host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000 } };
}
export async function deliverMail(config, message, dependencies = {}) {
  if (config.transport === 'smtp') {
    const factory = dependencies.createTransport || (await import('nodemailer')).default.createTransport;
    const transport = factory(config.smtp);
    try {
      const result = await transport.sendMail({ ...message, from: config.from, to: config.to });
      if (result.rejected?.length) throw new Error('Uno o más destinatarios fueron rechazados por SMTP');
      return { transport: 'smtp', accepted: result.accepted?.length ?? config.to.length };
    } catch { throw new Error('No se pudo completar el envío SMTP a todos los destinatarios. Revisar configuración del remitente y del servidor.'); }
    finally { transport.close?.(); }
  }
  const response = await (dependencies.fetch || fetch)('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json', 'idempotency-key': message.idempotencyKey },
    body: JSON.stringify({ from: config.from, to: config.to, subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error(`El servicio de correo rechazó el envío (HTTP ${response.status}). Revisar dominio verificado, permisos y destinatarios.`);
  return { transport: 'resend', accepted: config.to.length };
}
export async function sendPendingEmails(client, settings, config, report, send = deliverMail) {
  if (!config.enabled) return { enabled: false, pending: null, sent: 0 };
  const issues = await client.listIssues(settings.label);
  const currentlyConfirmed = new Set(collectAlerts(report).map(alert => alert.key));
  const pending = issues.map(issue => ({ issue, meta: readAlert(issue) })).filter(x => x.meta && !x.meta.mailDelivered && (x.issue.state === 'open' ? currentlyConfirmed.has(x.meta.key) : x.meta.mailEvent === 'resolved'))
    .sort((a, b) => a.meta.key.localeCompare(b.meta.key)).slice(0, 40);
  if (!pending.length) return { enabled: true, pending: 0, sent: 0 };
  const opened = pending.filter(x => x.issue.state === 'open');
  const resolved = pending.filter(x => x.issue.state === 'closed');
  const subject = `[YPF Salud] ${opened.length} incidencias · ${resolved.length} recuperaciones`;
  const text = ['Monitor de salud web YPF', '', 'Avisos de imágenes, enlaces y páginas inaccesibles observados desde GitHub Actions.', 'Las observaciones no prueban una caída global del sitio.', '',
    ...pending.flatMap(({ issue, meta }) => [`${issue.state === 'open' ? 'INCIDENCIA' : 'RECUPERACIÓN'}: ${issue.title}`, `Página: ${meta.page}`, `Recurso: ${meta.resource}`, `Detalle y evidencia: ${issue.html_url}`, '']),
    `Ejecución actual: ${report.runUrl || report.id}`, '', 'Este mensaje agrupa cambios de estado; no se repite en cada comprobación mientras el estado permanezca igual.'].join('\n');
  const idempotencyKey = createHash('sha256').update(pending.map(x => `${x.meta.key}:${x.meta.mailEvent || 'opened'}:${x.meta.lastRunId}`).join('|')).digest('hex');
  await send(config, { subject, text, idempotencyKey });
  // Acknowledge only after acceptance by the provider. Failed deliveries remain pending for the next run.
  for (const { issue } of pending) await client.editIssue(issue.number, { body: setAlertMailState(issue.body, true) });
  return { enabled: true, pending: pending.length, sent: pending.length, recipients: config.to.length };
}
