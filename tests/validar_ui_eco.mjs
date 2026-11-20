import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const debuggerUrl = process.env.ECO_CHROME_DEBUG ?? 'http://127.0.0.1:9225';
const pages = await (await fetch(debuggerUrl + '/json/list')).json();
const page = pages.find((item) => item.type === 'page');
assert.ok(page, 'Inicia Chrome con depuración remota antes de ejecutar la prueba');
const connection = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  connection.addEventListener('open', resolve, { once: true });
  connection.addEventListener('error', reject, { once: true });
});
let sequence = 0;
let analyses = 0;
const pending = new Map();
connection.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data);
  if (response.method === 'Network.requestWillBeSent' &&
      response.params.request.url.endsWith('/api/ia/analizar-residuos')) analyses++;
  const callbacks = pending.get(response.id);
  if (!callbacks) return;
  pending.delete(response.id);
  if (response.error) callbacks.reject(new Error(response.error.message));
  else callbacks.resolve(response.result);
});
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    connection.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const answer = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description);
  return answer.result.value;
}
async function until(expression, attempts = 160) {
  for (let i = 0; i < attempts; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('No se cumplió: ' + expression);
}
try {
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await send('Page.navigate', { url: process.env.ECO_TEST_URL ?? 'http://127.0.0.1:4174/' });
  await until("!!document.querySelector('input[type=file]')");
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', {
    nodeId, files: [resolve('taco-dataset/miniaturas/1239.jpg')],
  });
  await until("!!document.querySelector('.eco-tarjeta')");
  assert.equal(analyses, 1);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  assert.ok(await evaluate("!document.body.innerText.includes('¿Qué quieres desechar?')"));
  assert.ok(await evaluate("!document.body.innerText.includes('Indicar material manualmente')"));
  assert.ok(await evaluate("!document.body.innerText.includes('Solicitar recolección')"));
  await evaluate("document.querySelector('.eco-foto .recuadro').click()");
  assert.ok(await evaluate("!!document.querySelector('.eco-tarjeta.eco-activa')"));
  console.log('Flujo móvil verificado: reconocimiento automático, un análisis y recuadros interactivos.');
} finally {
  connection.close();
}
