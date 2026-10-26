import { accessIsBlocked } from './confirmation.js';

// Only the explicitly configured, read-only journeys are exercised.
export async function runFunctionalChecks(page, specifications, viewport) {
  const results = [];
  for (const spec of specifications) {
    if (spec.viewports && !spec.viewports.includes(viewport)) continue;
    const result = { id: spec.id, kind: spec.kind, status: 'unverified', message: 'Control no disponible; comportamiento sin verificar' };
    let isolated;
    try {
      const control = page.locator(spec.selector).first();
      if (!await control.isVisible()) { results.push(result); continue; }
      if (spec.kind === 'menu') {
        const initial = await control.getAttribute('aria-expanded');
        if (initial === null) throw new Error('Falta estado accesible aria-expanded');
        if (initial === 'true') await control.click({ timeout: 3000 });
        await control.click({ timeout: 3000 });
        try {
          await page.waitForFunction(({ selector, panel }) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true' && [...document.querySelectorAll(panel)].some(el => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden'), spec, { timeout: 3000 });
          result.status = 'passed'; result.message = 'El menú abre y su panel es visible';
        } catch { result.status = 'failed'; result.message = 'El clic no abrió el menú con el estado y panel esperados'; }
        if (await control.getAttribute('aria-expanded') === 'true') await control.click({ timeout: 3000 });
      } else if (spec.kind === 'carousel') {
        const active = page.locator(spec.stateSelector).first();
        const before = await active.getAttribute(spec.stateAttribute);
        const beforeScroll = spec.motionSelector ? await page.locator(spec.motionSelector).first().evaluate(el => el.scrollLeft) : null;
        if (before === null) throw new Error('Falta identificador de diapositiva activa');
        await control.click({ timeout: 3000 });
        try {
          await page.waitForFunction(({ selector, attribute, before }) => { const value = document.querySelector(selector)?.getAttribute(attribute); return value != null && value !== before; }, { selector: spec.stateSelector, attribute: spec.stateAttribute, before }, { timeout: 4000 });
          if (spec.motionSelector) await page.waitForFunction(({ selector, before }) => Math.abs(document.querySelector(selector).scrollLeft - before) > 5, { selector: spec.motionSelector, before: beforeScroll }, { timeout: 4000 });
          result.status = 'passed'; result.message = 'El selector del banner cambia la diapositiva activa y desplaza su contenido';
        } catch { result.status = 'failed'; result.message = 'El clic no cambió la diapositiva activa o no desplazó su contenido'; }
        result.before = before; result.after = await active.getAttribute(spec.stateAttribute);
      } else if (spec.kind === 'link') {
        const href = await control.getAttribute('href');
        const destination = new URL(href, page.url());
        if (!['https:', 'http:'].includes(destination.protocol) || destination.origin !== spec.expectedOrigin) throw new Error('Destino fuera del recorrido autorizado');
        // Separate page keeps the crawl and its network evidence untouched.
        isolated = await page.context().newPage();
        await isolated.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 15000 });
        const link = isolated.locator(spec.selector).first();
        const responsePromise = isolated.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await link.evaluate(el => el.setAttribute('target', '_self'));
        const [response] = await Promise.all([responsePromise, link.click({ timeout: 5000 })]);
        const observed = { httpStatus: response?.status(), title: await isolated.title(), finalUrl: isolated.url() };
        result.observed = observed;
        if (accessIsBlocked(observed)) result.message = 'Destino bloqueado para el monitor; navegación no verificable';
        else if (!response) result.message = 'Navegación sin respuesta HTTP verificable';
        else if (observed.httpStatus >= 400 || new URL(observed.finalUrl).origin !== spec.expectedOrigin || /^(?:404|page not found|página no encontrada)/i.test(observed.title)) { result.status = 'failed'; result.message = 'El enlace navega a un error o destino inesperado'; }
        else { result.status = 'passed'; result.message = 'El enlace principal navega al destino esperado con respuesta correcta'; }
      }
    } catch (error) { result.status = 'unverified'; result.message = `Sin evidencia concluyente: ${error.message}`; }
    finally { await isolated?.close(); }
    results.push(result);
  }
  return results;
}
