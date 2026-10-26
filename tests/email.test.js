import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { emailConfiguration, deliverMail, sendPendingEmails } from '../src/email.js';
import { metadata, readAlert } from '../src/alerts.js';
const env = { EMAIL_TRANSPORT: 'smtp', ALERT_EMAIL_TO: 'one@example.test,two@example.test,ONE@example.test', ALERT_EMAIL_FROM: 'sender@example.test', SMTP_HOST: 'smtp.example.test', SMTP_USER: 'sender', SMTP_PASSWORD: 'test-placeholder', SMTP_PORT: '465' };
test('admite dos destinatarios, deduplica y exige configuración de remitente', () => {
  assert.deepEqual(emailConfiguration(env).to, ['one@example.test', 'two@example.test']);
  assert.equal(emailConfiguration(env).smtp.secure, true);
  assert.equal(emailConfiguration({ ...env, SMTP_PORT: '587' }).smtp.requireTLS, true);
  assert.equal(emailConfiguration({}).enabled, false);
  assert.throws(() => emailConfiguration({ ...env, ALERT_EMAIL_FROM: '' }), /remitente/);
  assert.throws(() => emailConfiguration({ ...env, ALERT_EMAIL_TO: 'bad-address' }), /destinatarios/);
});
test('genera un mensaje SMTP para ambas direcciones sin conectarse a un servidor', async () => {
  let generated;
  const result = await deliverMail(emailConfiguration(env), { subject: '[YPF Salud] Prueba controlada', text: 'Ejemplo de alerta' }, { createTransport: () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    return { sendMail: async message => { const info = await transport.sendMail(message); generated = info.message.toString(); return info; } };
  } });
  assert.equal(result.accepted, 2); assert.match(generated, /one@example.test/); assert.match(generated, /two@example.test/);
});
function pending() {
  const issue = { number: 1, title: 'Imagen rota', state: 'open', html_url: 'https://github.com/example/repo/issues/1', user: { login: 'github-actions[bot]' }, body: metadata({ version: 1, key: 'abc', category: 'image', page: 'https://example.test/', resource: 'https://example.test/img.webp', viewports: ['desktop'], lastRunId: 'run-1', mailDelivered: false }) };
  const client = { listIssues: async () => [issue], editIssue: async (number, body) => Object.assign(issue, body) };
  return { issue, client };
}
test('un envío aceptado se confirma y no se repite en cada ejecución', async () => {
  const { client, issue } = pending(); let calls = 0;
  const send = async (config, message) => { calls++; assert.equal(config.to.length, 2); assert.match(message.text, /Imagen rota/); };
  const result = await sendPendingEmails(client, { label: 'ypf-health' }, emailConfiguration(env), { id: 'run-1' }, send);
  assert.equal(result.sent, 1); assert.equal(readAlert(issue).mailDelivered, true);
  await sendPendingEmails(client, { label: 'ypf-health' }, emailConfiguration(env), { id: 'run-2' }, send);
  assert.equal(calls, 1);
});
test('un envío fallido conserva el pendiente para reintentar', async () => {
  const { client, issue } = pending();
  await assert.rejects(sendPendingEmails(client, { label: 'ypf-health' }, emailConfiguration(env), { id: 'run-1' }, async () => { throw new Error('SMTP temporalmente caído'); }));
  assert.equal(readAlert(issue).mailDelivered, false);
  await sendPendingEmails(client, { label: 'ypf-health' }, emailConfiguration(env), { id: 'run-2' }, async () => {});
  assert.equal(readAlert(issue).mailDelivered, true);
});
