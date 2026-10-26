import { accessIsBlocked } from './confirmation.js';
export async function probeExternal(request, url, config) {
  const attempts = [];
  const maximum = Math.max(1, Math.min(3, config.confirmation?.attempts ?? 2));
  for (let attempt = 1; attempt <= maximum; attempt++) {
    let observation;
    try {
      const response = await request.get(url, { timeout: Math.min(config.timeoutMs, 15000), maxRedirects: 5 });
      try {
        const httpStatus = response.status();
        let title = '', accessBlocked = false;
        if ((response.headers()['content-type'] || '').includes('text/html')) {
          const text = (await response.text()).slice(0, 16384);
          title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
          accessBlocked = /the requested url was rejected/i.test(text);
        }
        accessBlocked = accessIsBlocked({ title, httpStatus, accessBlocked });
        const softError = /\/(?:error|404|not-found)(?:\.|\/|\?|$)/i.test(response.url()) || (config.errorPagePatterns || []).some(pattern => new RegExp(pattern, 'i').test(title));
        observation = { url, finalUrl: response.url(), httpStatus, title, accessBlocked, softError,
          status: httpStatus >= 400 || accessBlocked || softError ? 'degraded' : 'healthy' };
      } finally { await response.dispose(); }
    } catch (error) { observation = { url, status: 'degraded', error: error.message }; }
    attempts.push(observation);
    if (observation.status === 'healthy' || attempt === maximum) break;
    await new Promise(resolve => setTimeout(resolve, config.confirmation?.delayMs ?? 1000));
  }
  const last = attempts.at(-1);
  const failureKind = item => item.error || item.httpStatus >= 500 ? 'availability' : [404, 410].includes(item.httpStatus) || item.softError ? 'link' : 'other';
  const confirmed = last.status !== 'healthy' && !last.accessBlocked && attempts.length >= 2 && attempts.every(item => !item.accessBlocked && item.status !== 'healthy' && failureKind(item) === failureKind(last));
  return { ...last, confirmed, attempts };
}
